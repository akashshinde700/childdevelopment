import { hashPassword } from './password'
import { encryptSecret } from './secret-crypto'

/**
 * The User fields to write whenever a tenant login's password is set or
 * changed — from Platform Admin, User Management, Employees, or the clinic's
 * own Settings page.
 *
 * `password` is the bcrypt hash auth actually checks. `generatedPasswordEnc`
 * is the reversible copy the Platform Admin's Organizations list shows, so a
 * clinic that changes its own password doesn't leave Platform Admin
 * displaying the long-dead provisioning password.
 *
 * Encryption needs ORG_PASSWORD_ENC_KEY. If it's missing or fails, the
 * password change still goes through — only the recoverable copy is skipped,
 * because nobody should be locked out of changing a password over a
 * convenience feature.
 */
export async function passwordWriteFields(plain: string): Promise<{ password: string; generatedPasswordEnc?: string }> {
  const password = await hashPassword(plain)
  try {
    return { password, generatedPasswordEnc: encryptSecret(plain) }
  } catch (err) {
    console.error('Could not store the recoverable password copy:', err)
    return { password }
  }
}
