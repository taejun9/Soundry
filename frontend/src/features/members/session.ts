import { reactive } from 'vue';
import type { SessionSummary } from '../../../../shared/contracts';
import { requestJson, ApiError } from '../../api/client';
export const session = reactive<SessionSummary>({ member: null, setupRequired: false, usage: null });
export async function refreshSession() {
  const data = await requestJson('/members/session');
  if (
    !data ||
    typeof data !== 'object' ||
    !('member' in data) ||
    !('setupRequired' in data) ||
    !('usage' in data)
  )
    throw new ApiError('회원 정보를 확인하지 못했어요.', 0, 'INVALID_RESPONSE');
  Object.assign(session, data);
}
