import Router from '@koa/router'
import { proxy } from './proxy-handler'

export const proxyRoutes: Router = new Router()

// Proxy all /api/*, /v1/* to upstream Hermes API
proxyRoutes.all('/api/(.*)', proxy)
proxyRoutes.all('/v1/(.*)', proxy)
