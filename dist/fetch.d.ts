import type { GoAccount } from "./types";
export interface RotatingFetchState {
    activeIndex: number | null;
    exhausted: Set<number>;
}
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export declare function createRotatingFetch(accounts: GoAccount[], lastIndex: number, baseFetch?: FetchFn): {
    fetch: FetchFn;
    state: RotatingFetchState;
};
export {};
