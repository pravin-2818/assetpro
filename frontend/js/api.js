const API = {
  base: '/api',
  getToken() { return localStorage.getItem('ap_tok'); },
  setToken(t) { localStorage.setItem('ap_tok', t); },
  removeToken() { localStorage.removeItem('ap_tok'); },
  getUser()  { try { return JSON.parse(localStorage.getItem('ap_usr')); } catch { return null; } },
  setUser(u) { localStorage.setItem('ap_usr', JSON.stringify(u)); },
  removeUser(){ localStorage.removeItem('ap_usr'); },

  async req(method, path, body) {
    const h = { 'Content-Type': 'application/json' };
    const tok = this.getToken();
    if (tok) h['Authorization'] = 'Bearer ' + tok;
    const opts = { method, headers: h };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(this.base + path, opts);
    const d = await res.json();
    if (res.status === 401) {
      // Token expired or invalid — clear and force re-login
      this.removeToken();
      this.removeUser();
      if (typeof showLogin === 'function') {
        showLogin();
        if (typeof toast === 'function') toast('Session expired — please log in again', 'warn');
      }
      throw { status: 401, message: d.message || 'Session expired. Please log in again.' };
    }
    if (!res.ok) throw { status: res.status, message: d.message || 'Request failed', errors: d.errors };
    return d;
  },
  get(p)    { return this.req('GET', p); },
  post(p,b) { return this.req('POST', p, b); },
  put(p,b)  { return this.req('PUT', p, b); },
  del(p)    { return this.req('DELETE', p); },

  async dl(path, filename) {
    const tok = this.getToken();
    const res = await fetch(this.base + path, { headers: tok ? { 'Authorization': 'Bearer ' + tok } : {} });
    if (res.status === 401) {
      this.removeToken(); this.removeUser();
      if (typeof showLogin === 'function') showLogin();
      throw new Error('Session expired');
    }
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }
};
