import type { Role } from './types'

export type AppEdition = 'client' | 'server'

export const APP_EDITION: AppEdition = import.meta.env.VITE_APP_EDITION === 'server' ? 'server' : 'client'
export const PRODUCT_NAME = APP_EDITION === 'server' ? 'Lumi Server' : 'Lumi Client'

export function isRoleAllowed(role: Role): boolean {
  return APP_EDITION === 'server' ? role === 'operator' : role === 'child' || role === 'guardian'
}
