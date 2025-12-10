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

export const uploadAvatar = async (file: File | { uri: string; type: string; name: string }, token: string) => {
  const formData = new FormData();
  
  // Для React Native используем объект с uri, для web - File
  if (file instanceof File) {
    formData.append("photo", file);
  } else {
    // Для React Native
    formData.append("photo", {
      uri: file.uri,
      type: file.type || 'image/jpeg',
      name: file.name || 'avatar.jpg',
    } as any);
  }
  
  formData.append("token", token);

  try {
    const response = await fetch(`${baseApi}/upload`, {
      method: 'POST',
      body: formData,
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

export const editProfile = async (data: any) => {
  try {
    const response = await fetch(`${baseApi}/profile`, {
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

export const getOnline = async (data: any) => {
  try {
    const response = await fetch(`${baseApi}/online`, {
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

export const getUsersOnline = async (token: string) => {
  const data = {
    token,
  };

  try {
    const response = await fetch(`${baseApi}/online_users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    console.log('Users online data:', json);
    return json;
  } catch (err) {
    console.error('Error fetching online users:', err);
    return null;
  }
};

export const getMessages = async (token: string) => {
  const data = {
    token
  };

  try {
    const response = await fetch(`${baseApi}/get_messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    const responseData = await response.json();
    if (!response.ok) {
      return {status: 'failed', data: responseData};
    }

    console.log('get Messages', responseData)
    return {status: 'success', data: responseData};
  } catch (error) {
    console.error('Error:', error);
    return {status: 'failed', error: error};
  }
};

export const readMessages = async (token: string, chat_partner_id: number) => {
  const data = {
    token,
    chat_partner_id
  };

  try {
    const response = await fetch(`${baseApi}/read_messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();

    if (!response.ok) {
      return {status: 'failed', data: responseData};
    }

    return {status: 'success', data: responseData};
  } catch (error) {
    console.error('Error:', error);
    return {status: 'failed', error: error};
  }
};

export const sendMessage = async (token: string, receiver_id: number, message_text: string) => {
  const data = {
    token,
    receiver_id,
    message_text
  };

  try {
    const response = await fetch(`${baseApi}/send_message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();

    if (!response.ok) {
      return {status: 'failed', data: responseData};
    }

    return {status: 'success', data: responseData};
  } catch (error) {
    console.error('Error:', error);
    return {status: 'failed', error: error};
  }
};

