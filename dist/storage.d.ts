import type { AccountsFile, RotationState } from "./types";
export declare function loadAccounts(): AccountsFile;
export declare function saveAccounts(data: AccountsFile): void;
export declare function loadRotationState(): RotationState;
export declare function saveRotationState(state: RotationState): void;
