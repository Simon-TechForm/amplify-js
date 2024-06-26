// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { PinpointServiceOptions } from '@aws-amplify/core/internals/providers/pinpoint';

/**
 * Options specific to Pinpoint identityUser.
 * Convert interface `IdentifyUserOptions` to a type to avoid `index signature 'string' is missing`
 * Taken from https://github.com/microsoft/TypeScript/issues/15300#issuecomment-1320421641
 */
export type IdentifyUserOptions = Pick<
	PinpointServiceOptions,
	keyof PinpointServiceOptions
>;
