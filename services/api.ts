const baseApi = 'https://peoplemeet.com.ua';

export const loginUser = async (data: { email: string; password: string }) => {
  try {
    const response = await fetch(`${baseApi}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();

    if (!response.ok) {
      return { status: 'failed', data: responseData };
    }

    return { status: 'success', data: responseData };
  } catch (error) {
    console.error('Error:', error);
    return { status: 'failed', error: error };
  }
};

export const signUpUser = async (data: { email: string; password: string }) => {
  try {
    const response = await fetch(`${baseApi}/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();

    if (!response.ok) {
      return { status: 'failed', data: responseData };
    }

    return { status: 'success', data: responseData };
  } catch (error) {
    console.error('Error:', error);
    return { status: 'failed', error: error };
  }
};

export const getRecoverCode = async (email: string) => {
  const data = {
    email,
  };

  try {
    const response = await fetch(`${baseApi}/send_recovery_code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();

    if (!response.ok) {
      return { status: 'failed', data: responseData };
    }

    return { status: 'success', data: responseData };
  } catch (error) {
    console.error('Error:', error);
    return { status: 'failed', error: error };
  }
};

export const checkRecoveryCode = async (email: string, recoveryCode: string) => {
  const data = {
    email,
    recoveryCode,
  };

  try {
    const response = await fetch(`${baseApi}/check_recovery_code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();

    if (!response.ok) {
      return { status: 'failed', data: responseData };
    }

    return { status: 'success', data: responseData };
  } catch (error) {
    console.error('Error:', error);
    return { status: 'failed', error: error };
  }
};

export const changePassword = async (email: string, recoveryCode: string, newPassword: string) => {
  const data = {
    email,
    recoveryCode,
    password: newPassword,
  };

  try {
    const response = await fetch(`${baseApi}/change_password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();

    if (!response.ok) {
      return { status: 'failed', data: responseData };
    }

    return { status: 'success', data: responseData };
  } catch (error) {
    console.error('Error:', error);
    return { status: 'failed', error: error };
  }
};

export const getSelf = async (token: string) => {
  const data = {
    token,
  };

  try {
    const response = await fetch(`${baseApi}/self`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();

    if (!response.ok) {
      return { status: 'failed', data: responseData };
    }

    return { status: 'success', data: responseData };
  } catch (error) {
    console.error('Error:', error);
    return { status: 'failed', error: error };
  }
};

