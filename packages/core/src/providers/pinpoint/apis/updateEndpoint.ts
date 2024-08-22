// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
	UpdateEndpointInput,
	updateEndpoint as clientUpdateEndpoint,
} from '../../../awsClients/pinpoint';
import { amplifyUuid } from '../../../utils/amplifyUuid';
import { PinpointUpdateEndpointInput } from '../types';
import { cacheEndpointId } from '../utils/cacheEndpointId';
import {
	clearCreatedEndpointId,
	createEndpointId,
} from '../utils/createEndpointId';
import { getEndpointId } from '../utils/getEndpointId';

/**
 * @internal
 */
export const updateEndpoint = async ({
	address,
	appId,
	category,
	channelType,
	credentials,
	identityId,
	optOut,
	region,
	userAttributes,
	userId,
	userProfile,
	userAgentValue,
}: PinpointUpdateEndpointInput): Promise<void> => {
	const endpointId = await getEndpointId(appId, category);
	// only generate a new endpoint id if one was not found in cache
	const createdEndpointId = !endpointId
		? createEndpointId(appId, category)
		: undefined;
	const {
		customProperties,
		demographic,
		email,
		location,
		metrics,
		name,
		plan,
	} = userProfile ?? {};

	// only automatically populate the endpoint with client info and identity id upon endpoint creation to
	// avoid overwriting the endpoint with these values every time the endpoint is updated
	const resolvedUserId = createdEndpointId ? (userId ?? identityId) : userId;
	const attributes = {
		...(email && { email: [email] }),
		...(name && { name: [name] }),
		...(plan && { plan: [plan] }),
		...customProperties,
	};

	const shouldAddAttributes = email || customProperties || name || plan;
	const shouldAddUser = resolvedUserId || userAttributes;

	const input: UpdateEndpointInput = {
		ApplicationId: appId,
		EndpointId: endpointId ?? createdEndpointId,
		EndpointRequest: {
			RequestId: amplifyUuid(),
			EffectiveDate: new Date().toISOString(),
			ChannelType: channelType,
			Address: address,
			...(shouldAddAttributes && { Attributes: attributes }),
			...(demographic && {
				Demographic: {
					AppVersion: demographic.appVersion,
					Locale: demographic.locale,
					Make: demographic.make,
					Model: demographic.model,
					ModelVersion: demographic.modelVersion,
					Platform: demographic.platform,
					PlatformVersion: demographic.platformVersion,
					Timezone: demographic.timezone,
				},
			}),
			...(location && {
				Location: {
					City: location.city,
					Country: location.country,
					Latitude: location.latitude,
					Longitude: location.longitude,
					PostalCode: location.postalCode,
					Region: location.region,
				},
			}),
			Metrics: metrics,
			OptOut: optOut,
			...(shouldAddUser && {
				User: {
					UserId: resolvedUserId,
					UserAttributes: userAttributes,
				},
			}),
		},
	};
	try {
		await clientUpdateEndpoint({ credentials, region, userAgentValue }, input);
		// if we had to create an endpoint id, we need to now cache it
		if (createdEndpointId) {
			await cacheEndpointId(appId, category, createdEndpointId);
		}
	} finally {
		// at this point, we completely reset the behavior so even if the update was unsuccessful
		// we can just start over with a newly created endpoint id
		if (createdEndpointId) {
			clearCreatedEndpointId(appId, category);
		}
	}
};
