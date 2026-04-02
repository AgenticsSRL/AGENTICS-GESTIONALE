const SAFE_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Credenziali non valide.',
  'Email not confirmed': 'Email non confermata. Controlla la tua casella di posta.',
  'User already registered': 'Utente già registrato.',
  'New password should be different from the old password': 'La nuova password deve essere diversa dalla precedente.',
  'Auth session missing!': 'Sessione scaduta. Effettua nuovamente l\'accesso.',
  'JWT expired': 'Sessione scaduta. Effettua nuovamente l\'accesso.',
  'invalid claim: missing sub claim': 'Sessione non valida. Effettua nuovamente l\'accesso.',
}

export function safeErrorMessage(err: unknown, fallback = 'Si è verificato un errore. Riprova.'): string {
  if (!(err instanceof Error)) return fallback
  return SAFE_MESSAGES[err.message] ?? fallback
}
