/*
 * Copyright 2017-2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with
 * the License. A copy of the License is located at
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
 * CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 * and limitations under the License.
 */

import {
	ConsoleLogger as Logger,
	HubCallback,
	HubCapsule,
	Hub,
	StorageHelper,
} from '@aws-amplify/core';
import flatten from 'lodash/flatten';
import { AWSPinpointProvider } from './Providers';
import {
	addMessageEventListener,
	MessageEvent,
	notifyMessageEventListeners,
} from '../EventListeners';
import {
	InAppMessage,
	InAppMessagingConfig,
	InAppMessagingEvent,
	InAppMessagingProvider,
	NotificationsSubcategory,
	OnMessageEventHandler,
	OnMessageEventListener,
	OnMessagesReceivedHandler,
	OnMessagesReceivedListener,
} from './types';

const STORAGE_KEY_SUFFIX = '_inAppMessages';

const logger = new Logger('Notifications.InAppMessaging');

export default class InAppMessaging {
	private config: Record<string, any> = {};
	private listeningForAnalyticEvents = false;
	private pluggables: InAppMessagingProvider[] = [];
	private storageSynced = false;

	constructor() {
		this.config = {
			storage: new StorageHelper().getStorage(),
		};
	}

	/**
	 * Configure InAppMessaging
	 * @param {Object} config - InAppMessaging configuration object
	 */
	configure = ({
		listenForAnalyticsEvents = true,
		...config
	}: InAppMessagingConfig = {}): InAppMessagingConfig => {
		this.config = { ...this.config, ...config };

		logger.debug('configure InAppMessaging', this.config);

		this.pluggables.forEach(pluggable => {
			pluggable.configure({
				...this.config,
				...(this.config[pluggable.getProviderName()] ?? {}),
			});
		});

		if (this.pluggables.length === 0) {
			this.addPluggable(new AWSPinpointProvider());
		}

		if (listenForAnalyticsEvents && !this.listeningForAnalyticEvents) {
			Hub.listen('analytics', this.analyticsListener);
			this.listeningForAnalyticEvents = true;
		}

		return this.config;
	};

	/**
	 * Get the name of this module
	 * @returns {string} name of this module
	 */
	getModuleName(): NotificationsSubcategory {
		return 'InAppMessaging';
	}

	/**
	 * Get a plugin from added plugins
	 * @param {string} providerName - the name of the plugin to get
	 */
	getPluggable = (providerName: string): InAppMessagingProvider => {
		const pluggable =
			this.pluggables.find(
				pluggable => pluggable.getProviderName() === providerName
			) ?? null;

		if (!pluggable) {
			logger.debug(`No plugin found with name ${providerName}`);
		}

		return pluggable;
	};

	/**
	 * Add plugin into InAppMessaging
	 * @param {InAppMessagingProvider} pluggable - an instance of the plugin
	 */
	addPluggable = (pluggable: InAppMessagingProvider): void => {
		if (
			pluggable &&
			pluggable.getCategory() === 'Notifications' &&
			pluggable.getSubCategory() === 'InAppMessaging'
		) {
			this.pluggables.push(pluggable);
			pluggable.configure(this.config[pluggable.getProviderName()]);
		}
	};

	/**
	 * Remove a plugin from added plugins
	 * @param {string} providerName - the name of the plugin to remove
	 */
	removePluggable = (providerName: string): void => {
		const index = this.pluggables.findIndex(
			pluggable => pluggable.getProviderName() === providerName
		);
		if (index === -1) {
			logger.debug(`No plugin found with name ${providerName}`);
		} else {
			this.pluggables.splice(index, 1);
		}
	};

	/**
	 * Get the map resources that are currently available through the provider
	 * @param {string} provider
	 * @returns - Array of available map resources
	 */
	syncMessages = async (): Promise<void> => {
		await Promise.all<void>(
			this.pluggables.map(async pluggable => {
				const messages = await pluggable.getInAppMessages();
				const key = `${pluggable.getProviderName()}${STORAGE_KEY_SUFFIX}`;
				await this.setMessages(key, messages);
			})
		);
	};

	clearMessages = async (): Promise<void> => {
		logger.debug('clearing In-App Messages');

		await Promise.all<void>(
			this.pluggables.map(async pluggable => {
				const key = `${pluggable.getProviderName()}${STORAGE_KEY_SUFFIX}`;
				await this.removeMessages(key);
			})
		);
	};

	dispatchEvent = async (event: InAppMessagingEvent): Promise<void> => {
		const messages: any[] = await Promise.all<any[]>(
			this.pluggables.map(async pluggable => {
				const key = `${pluggable.getProviderName()}${STORAGE_KEY_SUFFIX}`;
				const messages = await this.getMessages(key);
				return pluggable.processInAppMessages(messages, event);
			})
		);

		const flattenedMessages = flatten(messages);
		if (flattenedMessages.length) {
			notifyMessageEventListeners(
				flattenedMessages,
				MessageEvent.MESSAGES_RECEIVED
			);
		}
	};

	onMessagesReceived = (
		handler: OnMessagesReceivedHandler
	): OnMessagesReceivedListener =>
		addMessageEventListener(handler, MessageEvent.MESSAGES_RECEIVED);

	onMessageDisplayed = (
		handler: OnMessageEventHandler
	): OnMessageEventListener =>
		addMessageEventListener(handler, MessageEvent.MESSAGE_DISPLAYED);

	onMessageDismissed = (
		handler: OnMessageEventHandler
	): OnMessageEventListener =>
		addMessageEventListener(handler, MessageEvent.MESSAGE_DISMISSED);

	onMessageActionTaken = (
		handler: OnMessageEventHandler
	): OnMessageEventListener =>
		addMessageEventListener(handler, MessageEvent.MESSAGE_ACTION_TAKEN);

	notifyMessageDisplayed = (message: InAppMessage): void => {
		notifyMessageEventListeners(message, MessageEvent.MESSAGE_DISPLAYED);
	};

	notifyMessageDismissed = (message: InAppMessage): void => {
		notifyMessageEventListeners(message, MessageEvent.MESSAGE_DISMISSED);
	};

	notifyMessageActionTaken = (message: InAppMessage): void => {
		notifyMessageEventListeners(message, MessageEvent.MESSAGE_ACTION_TAKEN);
	};

	private analyticsListener: HubCallback = ({ payload }: HubCapsule) => {
		const { event, data } = payload;
		switch (event) {
			case 'record': {
				this.dispatchEvent(data);
				break;
			}
			default:
				break;
		}
	};

	private syncStorage = async (): Promise<void> => {
		const { storage } = this.config;
		try {
			// Only run sync() if it's available (i.e. React Native)
			if (typeof storage.sync === 'function') {
				await storage.sync();
			}
			this.storageSynced = true;
		} catch (err) {
			logger.error('Failed to sync storage', err);
		}
	};

	private getMessages = async (key: string): Promise<any> => {
		try {
			if (!this.storageSynced) {
				await this.syncStorage();
			}
			const { storage } = this.config;
			const storedMessages = storage.getItem(key);
			return storedMessages ? JSON.parse(storedMessages) : [];
		} catch (err) {
			logger.error('Failed to retrieve in-app messages from storage', err);
		}
	};

	private setMessages = async (
		key: string,
		messages: InAppMessage[]
	): Promise<void> => {
		if (!messages) {
			return;
		}

		try {
			if (!this.storageSynced) {
				await this.syncStorage();
			}
			const { storage } = this.config;
			storage.setItem(key, JSON.stringify(messages));
		} catch (err) {
			logger.error('Failed to store in-app messages', err);
		}
	};

	private removeMessages = async (key: string): Promise<void> => {
		try {
			if (!this.storageSynced) {
				await this.syncStorage();
			}
			const { storage } = this.config;
			storage.removeItem(key);
		} catch (err) {
			logger.error('Failed to remove in-app messages from storage', err);
		}
	};
}
