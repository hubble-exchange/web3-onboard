let blocknative: any

export function initializeBlocknative(): any {
  return blocknative
}

export function getBlocknative(): any {
  if (!blocknative) {
  }
  return blocknative
}

export function closeSocketConnection(): void {
  blocknative?.destroy()
}
