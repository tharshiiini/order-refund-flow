import type { CreateRefundRequest, RefundSelection } from '../types/order'

export function selectionToItems(
  selection: RefundSelection,
): CreateRefundRequest['items'] {
  const addonsByUnit = new Map<string, string[]>()
  for (const addon of selection.addons) {
    const list = addonsByUnit.get(addon.unitId) ?? []
    list.push(addon.addonId)
    addonsByUnit.set(addon.unitId, list)
  }
  return selection.unitIds.map((unitId) => ({
    unit_id: unitId,
    addon_ids: addonsByUnit.get(unitId) ?? [],
  }))
}
