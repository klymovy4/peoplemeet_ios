// API base URL. Set via the EXPO_PUBLIC_API_URL environment variable
// (see .env.example); falls back to the production URL when unset.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://peoplemeet.com.ua';

export type ApiResult =
  | { status: 'success'; data: any }
  | { status: 'failed'; data?: any; error?: unknown };

// Handler for an expired/invalid session (401). Registered at app startup
// (see services/session.ts) so the network layer does not depend on the router.
let onUnauthorized: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

// Whether the request body contains a token - only such requests can mean "session expired".
// (login/signup/recovery send email/password, not a token.)
const bodyHasToken = (body: unknown): boolean =>
  !!body && typeof body === 'object' && 'token' in (body as Record<string, unknown>);

/**
 * Single entry point for sending JSON requests to the API.
 * Returns whether the HTTP response succeeded and the parsed body.
 * On 401 for an authenticated request, triggers the logout handler.
 */
async function apiPost(path: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 && bodyHasToken(body)) {
    onUnauthorized?.();
  }

  const data = await response.json();
  return { ok: response.ok, data };
}

/**
 * Wrapper around apiPost with a uniform { status, data } result
 * and centralized network error handling.
 */
async function request(path: string, body: unknown): Promise<ApiResult> {
  try {
    const { ok, data } = await apiPost(path, body);
    return ok ? { status: 'success', data } : { status: 'failed', data };
  } catch (error) {
    console.error('API error:', path, error);
    return { status: 'failed', error };
  }
}

export const loginUser = (data: { email: string; password: string }) =>
  request('/login', data);

export const signUpUser = (data: { email: string; password: string }) =>
  request('/signup', data);

export const getRecoverCode = (email: string) =>
  request('/send_recovery_code', { email });

export const checkRecoveryCode = (email: string, recoveryCode: string) =>
  request('/check_recovery_code', { email, recoveryCode });

export const changePassword = (email: string, recoveryCode: string, newPassword: string) =>
  request('/change_password', { email, recoveryCode, password: newPassword });

export const getSelf = (token: string) => request('/self', { token });

export const editProfile = (data: any) => request('/profile', data);

export const getOnline = (data: any) => request('/online', data);

export const getMessages = (token: string) => request('/get_messages', { token });

export const readMessages = (token: string, chat_partner_id: number) =>
  request('/read_messages', { token, chat_partner_id });

export const sendMessage = (token: string, receiver_id: number, message_text: string) =>
  request('/send_message', { token, receiver_id, message_text });

export const removeConversation = (token: string, chat_partner_id: number) =>
  request('/remove_conversation', { token, chat_partner_id });

/**
 * Avatar upload. Uses multipart/form-data, so it does not go through apiPost:
 * in React Native the file is passed as { uri, type, name }, on web as a File.
 */
export const uploadAvatar = async (
  file: File | { uri: string; type: string; name: string },
  token: string,
): Promise<ApiResult> => {
  const formData = new FormData();

  if (file instanceof File) {
    formData.append('photo', file);
  } else {
    formData.append('photo', {
      uri: file.uri,
      type: file.type || 'image/jpeg',
      name: file.name || 'avatar.jpg',
    } as any);
  }

  formData.append('token', token);

  try {
    const response = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    return response.ok ? { status: 'success', data } : { status: 'failed', data };
  } catch (error) {
    console.error('API error: /upload', error);
    return { status: 'failed', error };
  }
};

/**
 * Online users list. Returns the raw server response
 * (the format is parsed by the map screen), or null on error.
 */
export const getUsersOnline = async (token: string): Promise<any | null> => {
  try {
    const { ok, data } = await apiPost('/online_users', { token });
    if (!ok) {
      throw new Error(`HTTP error! status from /online_users`);
    }
    return data;
  } catch (err) {
    console.error('Error fetching online users:', err);
    return null;
  }
};