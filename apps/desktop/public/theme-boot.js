// Applies the saved theme before first paint so there is no light/dark flash.
try {
  var pref = localStorage.getItem("mathos.theme") || "system"
  var dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.dataset.theme = dark ? "dark" : "light"
} catch (e) {
  document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}
