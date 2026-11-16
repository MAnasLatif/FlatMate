/** What an admin sends with the apartment's join code, by copying or sharing it. */
export function joinCodeMessage(apartmentName: string, code: string): string {
  return `Join ${apartmentName} on FlatMate with this code: ${code}`;
}
