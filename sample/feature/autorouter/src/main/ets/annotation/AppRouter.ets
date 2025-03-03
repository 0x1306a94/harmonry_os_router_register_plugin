// 装饰器参数
export interface AppRouterParam {
  // 跳转的路由名
  name: string;

  // 是否需要登录
  login?: boolean;

  // 是否需要传递参数，需要的话设置为true，否则可不需要设置。
  hasParam?: boolean;

  // 参数名称
  paramName?: string;
}

// 自定义装饰器
export function AppRouter(param: AppRouterParam) {
  return Object;
}