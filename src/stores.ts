import { derived, get, writable } from 'svelte/store'
import {
  CancelablePromise,
  ReadableStore,
  StateSyncer,
  WalletCheckModule,
  WalletInterface,
  WalletInterfaceStore,
  WalletStateSliceStore,
  WritableStore
} from './interfaces'
import { createInterval } from './utilities'
import { validateType, validateWalletInterface } from './validation'

export const app: WritableStore = writable({
  dappId: '',
  apiUrl: '',
  networkId: 1,
  networkName: '',
  version: '',
  mobileDevice: false,
  os: '',
  darkMode: false,
  walletSelectInProgress: false,
  walletSelectCompleted: false,
  walletCheckInProgress: false,
  walletCheckCompleted: false,
  switchingWallets: false,
  accountSelectInProgress: false,
  autoSelectWallet: '',
  checkModules: [],
  walletSelectDisplayedUI: false,
  walletCheckDisplayedUI: false,
  displayBranding: false,
  blockPollingInterval: 4000,
  agreement: {}
})

export const stateSyncStatus: {
  [key: string]:
    | null
    | CancelablePromise
    | Promise<Array<string>>
    | Promise<string>
    | Promise<void>
  balance: null | CancelablePromise
  address: null | Promise<Array<string>>
  network: null | Promise<string>
} = {
  balance: null,
  address: null,
  network: null
}

export let address: WalletStateSliceStore
export let network: WalletStateSliceStore
export let balance: WalletStateSliceStore
export let wallet: WritableStore
export let state: ReadableStore
export let walletInterface: WalletInterfaceStore

let currentSyncerIntervals: ({ clear: () => void } | undefined)[]

export function initializeStores() {
  address = createWalletStateSliceStore({
    parameter: 'address',
    initialState: null
  })

  network = createWalletStateSliceStore({
    parameter: 'network',
    initialState: null
  })

  wallet = writable({
    name: null,
    provider: null,
    connect: null,
    instance: null,
    dashboard: null,
    type: null,
    icons: null
  })

  state = derived(
    [address, network, balance, wallet, app],
    ([$address, $network, $balance, $wallet, $app]) => {
      return {
        address: $address,
        network: $network,
        balance: $balance,
        wallet: $wallet,
        mobileDevice: $app.mobileDevice,
        appNetworkId: $app.networkId
      }
    }
  )

  currentSyncerIntervals = []

  walletInterface = createWalletInterfaceStore(null)
  walletInterface.subscribe((walletInterface: WalletInterface | null) => {
    // make sure that stores have been initialized
    if (state) {
      // clear all current intervals if they exist
      currentSyncerIntervals.forEach(
        (interval: { clear: () => void } | undefined) =>
          interval && interval.clear()
      )

      const currentState = get(state)

      // reset state
      currentState.balance && balance.reset()
      currentState.address && address.reset()
      currentState.network && network.reset()

      if (walletInterface) {
        // start syncing state and save intervals
        currentSyncerIntervals = [
          address.setStateSyncer(walletInterface.address),
          network.setStateSyncer(walletInterface.network)
          // balance.setStateSyncer(walletInterface.balance)
        ]
      }

      resetCheckModules()
    }
  })
}

export function resetWalletState(options?: {
  disconnected: boolean
  walletName: string
}) {
  walletInterface.update((currentInterface: WalletInterface | null) => {
    // no interface then don't do anything
    if (!currentInterface) {
      return currentInterface
    }

    // no options object, so do a full reset by disconnecting and setting interface to null
    if (!options) {
      wallet.update(() => ({
        name: undefined,
        provider: undefined,
        connect: undefined,
        instance: undefined,
        dashboard: undefined,
        type: undefined
      }))

      currentInterface.disconnect && currentInterface.disconnect()

      return null
    }

    const { walletName, disconnected } = options

    // if walletName is the same as the current interface name then do a full reset (checking if to do a disconnect)
    if (currentInterface.name === walletName) {
      wallet.update(() => ({
        name: undefined,
        provider: undefined,
        connect: undefined,
        instance: undefined,
        dashboard: undefined
      }))

      !disconnected &&
        currentInterface.disconnect &&
        currentInterface.disconnect()

      return null
    }

    return currentInterface
  })

  resetCheckModules()

  app.update(store => {
    return {
      ...store,
      walletSelectInProgress: false,
      walletSelectCompleted: false
    }
  })
}

function resetCheckModules() {
  const { checkModules } = get(app)
  if (Array.isArray(checkModules)) {
    checkModules.forEach((m: WalletCheckModule) => m.reset && m.reset())
  }
}

function createWalletInterfaceStore(
  initialState: null | WalletInterface
): WalletInterfaceStore {
  const { subscribe, set, update } = writable(initialState)

  return {
    subscribe,
    update,
    set: (walletInterface: WalletInterface | null) => {
      if (walletInterface) {
        validateWalletInterface(walletInterface)
      }
      set(walletInterface)
    }
  }
}

function createWalletStateSliceStore(options: {
  parameter: string
  initialState: string | number | null | undefined
  intervalSetting?: number
}): WalletStateSliceStore {
  const { parameter, initialState, intervalSetting } = options
  const { subscribe, set } = writable(initialState)

  let currentState: string | number | null | undefined
  subscribe(store => {
    currentState = store
  })

  return {
    subscribe,
    reset: () => {
      set(undefined)
    },
    get: () => currentState,
    setStateSyncer: (stateSyncer: StateSyncer) => {
      validateType({ name: 'stateSyncer', value: stateSyncer, type: 'object' })

      const { get, onChange } = stateSyncer

      validateType({
        name: `${parameter}.get`,
        value: get,
        type: 'function',
        optional: true
      })

      validateType({
        name: `${parameter}.onChange`,
        value: onChange,
        type: 'function',
        optional: true
      })

      if (onChange) {
        stateSyncStatus[parameter] = new Promise(resolve => {
          onChange(newVal => {
            resolve(undefined)
            if (newVal || currentState !== initialState) {
              set(newVal)
            }
          })
        })
        return
      }

      if (get) {
        const interval: any = createInterval(() => {
          stateSyncStatus[parameter] = get()
            .then(newVal => {
              stateSyncStatus[parameter] = null
              if (newVal || currentState !== initialState) {
                interval.status.active && set(newVal)
              }
            })
            .catch((err: any) => {
              console.warn(
                `Error getting ${parameter} from state syncer: ${err}`
              )
              stateSyncStatus[parameter] = null
            })
        }, intervalSetting || 200)

        return interval
      }
    }
  }
}
