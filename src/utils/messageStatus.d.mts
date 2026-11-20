export declare const MESSAGE_STATUS_PRIORITY: Readonly<Record<string, number>>;
export declare function resolveMessageStatusPriority(status: string | null | undefined): number;
export declare function pickHigherMessageStatus<T extends string | undefined>(currentStatus: T, nextStatus: T): T;
export declare function shouldReconcileMessageStatus(status: string | null | undefined): boolean;
