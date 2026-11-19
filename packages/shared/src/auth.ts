// 鉴权相关：管理端恒需登录，浏览端仅在配置了访问密码时才校验

export type AuthRole = 'admin' | 'view';

export interface AuthStatus {
  /** 管理端登录：恒为 true（账号密码） */
  adminLoginRequired: boolean;
  /** 浏览端是否开启了访问口令（由服务端 VIEW_PASSWORD 决定） */
  viewGate: boolean;
  /** 当前请求携带 token 解析出的角色，未登录为 null */
  role: AuthRole | null;
}

export interface LoginDto {
  mode: 'admin' | 'view';
  /** 仅 mode=admin 需要 */
  username?: string;
  password: string;
}

export interface LoginResult {
  token: string;
  role: AuthRole;
  /** 过期时间戳（毫秒） */
  expiresAt: number;
}
