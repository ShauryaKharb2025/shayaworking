export function roleHome(role) {
  switch (role) {
    case "patient": return "/sos";
    case "hospital": return "/hospital";
    case "driver": return "/driver";
    default: return "/login";
  }
}
