// RevenueCat (zakupy w aplikacji) tylko na iOS: na Androidzie nie linkujemy modułu, więc build nie dostaje uprawnienia
// com.android.vending.BILLING ani biblioteki Play Billing.
module.exports = {
  dependencies: {
    'react-native-purchases': { platforms: { android: null } },
  },
};
