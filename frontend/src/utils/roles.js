export function roleHome(role) {
  switch (role) {
    case "dispatcher":
    case "admin":
      return "/dispatcher";

    case "hospital":
      return "/hospital";

    case "operator":
      return "/operator";

    case "driver":
      return "/driver";

    case "clinician":
      return "/clinician";

    case "caregiver":
      return "/caregiver";

    default:
      return "/sos";
  }
}
