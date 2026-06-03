// Stores the activated license token and answers activation status. Seat limits are
// enforced where accounts are created.

import type { SettingsRepo } from '../db/repositories'
import { verifyLicense, type LicensePayload } from './verify'

const SETTING_KEY = 'licenseToken'

export interface LicenseStatus {
  activated: boolean
  payload?: LicensePayload
}

export class LicenseService {
  constructor(private settings: SettingsRepo) {}

  status(): LicenseStatus {
    const token = this.settings.get(SETTING_KEY)
    if (!token) return { activated: false }
    const result = verifyLicense(token)
    if (!result.valid) return { activated: false }
    return { activated: true, payload: result.payload }
  }

  activate(token: string): { ok: boolean; error?: string } {
    const result = verifyLicense(token)
    if (!result.valid) return { ok: false, error: result.error }
    this.settings.set(SETTING_KEY, token.trim())
    return { ok: true }
  }

  /**
   * Allowed account seats: a non-negative number where 0 = unlimited. Returns null when
   * not activated, so callers can distinguish "no license" from "unlimited license".
   */
  seats(): number | null {
    const status = this.status()
    if (!status.activated || !status.payload) return null
    return status.payload.seats
  }
}
