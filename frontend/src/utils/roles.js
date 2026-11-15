export function roleHome(role) {
  switch (role) {
    case "admin": return "/admin";
    case "patient": return "/sos";
    case "hospital": return "/hospital";
    case "driver": return "/driver";
    default: return "/login";
  }
}
