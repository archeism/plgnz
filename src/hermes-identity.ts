/** Collision-resistant sibling id for a generated Hermes command companion. */
export function hermesCommandCompanionId(pluginId: string): string {
  return `${pluginId}.plgnz-commands`;
}
