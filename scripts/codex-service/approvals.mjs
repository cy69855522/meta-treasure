import { REQUEST_LEASE_MS } from './config.mjs';

/**
 * Pending server-initiated requests (tool calls) are owned by whoever claims
 * them. Claiming is a lease, not a flag: a second claimer simply loses, and a
 * crashed owner stops blocking after REQUEST_LEASE_MS.
 */
const sameId = (a, b) => String(a) === String(b);

export const findRequest = (s, id) => s.requests.find(request => sameId(request.id, id));

export const isClaimed = (request, now = Date.now()) =>
  typeof request.claimedAt === 'number' && now - request.claimedAt < REQUEST_LEASE_MS;

export function claimRequest(s, id, now = Date.now()) {
  const request = findRequest(s, id);
  if (!request || isClaimed(request, now)) return null;
  request.claimedAt = now;
  return request;
}

export const removeRequest = (s, request) => {
  s.requests = s.requests.filter(item => item !== request);
};

export const requestView = (request, now = Date.now()) => ({
  id: request.id,
  method: request.method,
  params: request.params,
  claimed: isClaimed(request, now),
});
