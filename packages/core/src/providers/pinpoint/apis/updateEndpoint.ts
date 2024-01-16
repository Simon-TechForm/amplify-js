// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { amplifyUuid } from '../../../utils/amplifyUuid';
import {
	updateEndpoint as clientUpdateEndpoint,
	UpdateEndpointInput,
} from '../../../awsClients/pinpoint';
import { PinpointUpdateEndpointInput } from '../types';
import { cacheEndpointId } from '../utils/cacheEndpointId';
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
	const createdEndpointId = !endpointId ? amplifyUuid() : undefined;
	const {
		customProperties,
		demographic,
		email,
		location,
		metrics,
		name,
		plan,
	} = userProfile ?? {};
	const shouldAddAttributes = email || customProperties || name || plan;
	const attributes = {
		...(email && { email: [email] }),
		...(name && { name: [name] }),
		...(plan && { plan: [plan] }),
		...customProperties,
	};
	const input: UpdateEndpointInput = {
		ApplicationId: appId,
		EndpointId: endpointId ?? createdEndpointId,
		EndpointRequest: {
			RequestId: amplifyUuid(),
			EffectiveDate: new Date().toISOString(),
			ChannelType: channelType,
			Address: address,
			Attributes: shouldAddAttributes ? attributes : undefined,
			Demographic: {
				AppVersion: demographic?.appVersion,
				Locale: demographic?.locale,
				Make: demographic?.make,
				Model: demographic?.model,
				ModelVersion: demographic?.modelVersion,
				Platform: demographic?.platform,
				PlatformVersion: demographic?.platformVersion,
				Timezone: demographic?.timezone,
			},
			Location: {
				City: location?.city,
				Country: location?.country,
				Latitude: location?.latitude,
				Longitude: location?.longitude,
				PostalCode: location?.postalCode,
				Region: location?.region,
			},
			Metrics: metrics,
			OptOut: optOut,
			User: {
				UserId: userId ?? identityId,
				UserAttributes: userAttributes,
			},
		},
	};
	await clientUpdateEndpoint({ credentials, region, userAgentValue }, input);
	// if we had to create an endpoint id, we need to now cache it
	if (!!createdEndpointId) {
		return cacheEndpointId(appId, category, createdEndpointId);
	}
};
