import { requestJson, requestNoContent } from '../services/cloud-session-repository';

export async function readCloudOnboardingSettled(expectedUserId: string): Promise<boolean> {
  const result = await requestJson<{ settled?: unknown }>(
    '/api/onboarding',
    { method: 'GET' },
    expectedUserId,
  );
  if (typeof result.settled !== 'boolean') throw new Error('Invalid onboarding status response');
  return result.settled;
}

export async function writeCloudOnboardingSettled(expectedUserId: string): Promise<void> {
  await requestNoContent(
    '/api/onboarding',
    { method: 'PUT' },
    expectedUserId,
  );
}
