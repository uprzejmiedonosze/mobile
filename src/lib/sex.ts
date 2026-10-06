// Odmiana przez płeć użytkownika: backend zwraca `sexStrings` (SEXSTRINGS w config.php) w GET /user/ i /user/dashboard.
// `Patronką` = forma po „Zostań”: „Patronem” / „Patronką” / (płeć nieznana) „Patronką(em)”.
export const PATRONEM_DEFAULT = 'Patronką(em)';
export const patronem = (sexStrings?: Record<string, string> | null) => sexStrings?.['Patronką'] ?? PATRONEM_DEFAULT;
