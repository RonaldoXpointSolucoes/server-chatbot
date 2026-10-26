import { Mutex as AsyncMutex } from 'async-mutex'

export const makeMutex = () => {
	const mutex = new AsyncMutex()

	return {
		mutex<T>(code: () => Promise<T> | T): Promise<T> {
			return mutex.runExclusive(async () => {
				let timer: NodeJS.Timeout | undefined
				try {
					return await Promise.race([
						Promise.resolve().then(code),
						new Promise<never>((_, reject) => {
							timer = setTimeout(() => reject(new Error('MAKE_MUTEX_TIMEOUT')), 25000)
						})
					])
				} finally {
					if (timer) clearTimeout(timer)
				}
			})
		}
	}
}

export type Mutex = ReturnType<typeof makeMutex>

export const makeKeyedMutex = () => {
	const map = new Map<string, { mutex: AsyncMutex; refCount: number }>()

	return {
		async mutex<T>(key: string, task: () => Promise<T> | T): Promise<T> {
			let entry = map.get(key)

			if (!entry) {
				entry = { mutex: new AsyncMutex(), refCount: 0 }
				map.set(key, entry)
			}

			entry.refCount++

			try {
				return await entry.mutex.runExclusive(task)
			} finally {
				entry.refCount--
				// only delete it if this is still the current entry
				if (entry.refCount === 0 && map.get(key) === entry) {
					map.delete(key)
				}
			}
		}
	}
}

export type KeyedMutex = ReturnType<typeof makeKeyedMutex>
