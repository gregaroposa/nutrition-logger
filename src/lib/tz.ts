import { DateTime } from 'luxon'
const ZONE = 'Europe/Ljubljana'

export function nowLj(): DateTime {
  return DateTime.now().setZone(ZONE)
}

export function todayKey(): string {
  return nowLj().toFormat('yyyy-LL-dd')
}
