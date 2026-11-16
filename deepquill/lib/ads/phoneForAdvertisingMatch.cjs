/** International number only. A bare national number is not given a country code. */
function phoneForAdvertisingMatch(value) {
  if (typeof value !== 'string') return null;
  const phone = value.trim().replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

module.exports = { phoneForAdvertisingMatch };
