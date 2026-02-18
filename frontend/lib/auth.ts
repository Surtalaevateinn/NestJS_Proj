export const setToken = (token: string) => {
    localStorage.setItem('access_token', token);
};

export const getToken = () => {
    return localStorage.getItem('access_token');
};

export const logout = () => {
    localStorage.removeItem('access_token');
    window.location.href = '/login';
};