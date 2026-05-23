export interface GoAccount {
    apiKey: string;
    label?: string;
    addedAt: number;
    enabled: boolean;
}
export interface AccountsFile {
    version: 1;
    accounts: GoAccount[];
    rotationIndex: number;
}
export interface RotationState {
    lastUsedIndex: number;
}
