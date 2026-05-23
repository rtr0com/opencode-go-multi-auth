import type { GoAccount } from "./types";
export declare function nextIndex(last: number, total: number): number;
export declare function hasAccounts(accounts: GoAccount[]): boolean;
export declare class NoEnabledAccounts extends Error {
    constructor();
}
export declare function selectAccount(accounts: GoAccount[], lastIndex: number): {
    account: GoAccount;
    index: number;
};
