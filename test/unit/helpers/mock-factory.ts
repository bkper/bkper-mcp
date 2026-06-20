import {
    MockBkper,
    MockBook,
    MockAccount,
    MockTransaction,
    MockTransactionIterator,
    MockAccountBalance,
    MockGroup,
    MockDataTableBuilder,
    BookData,
    AccountData,
    TransactionData,
    AccountBalanceData,
    GroupData,
} from './mock-interfaces.js';
import { Amount, TransactionsDataTableBuilder } from 'bkper-js';
import type { Book } from 'bkper-js';
import { loadBalanceMatrixTotal, loadBalanceMatrixPeriod } from './fixture-loader.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// Mock DataTableBuilder implementation
function createMockDataTableBuilder(
    balances: AccountBalanceData[],
    query?: string
): MockDataTableBuilder {
    let formatValues = false;
    let formatDates = false;
    let transposed = false;
    let raw = false;
    let balanceType: any = null;
    let expandedValue: number = 0;

    return {
        formatValues(format: boolean): MockDataTableBuilder {
            formatValues = format;
            return this;
        },
        formatDates(format: boolean): MockDataTableBuilder {
            formatDates = format;
            return this;
        },
        transposed(transpose: boolean): MockDataTableBuilder {
            transposed = transpose;
            return this;
        },
        raw(rawMode: boolean): MockDataTableBuilder {
            raw = rawMode;
            return this;
        },
        expanded(value: number): MockDataTableBuilder {
            expandedValue = value;
            return this;
        },
        type(type: any): MockDataTableBuilder {
            balanceType = type;
            return this;
        },
        hideNames(): MockDataTableBuilder {
            return this;
        },
        build(): any[][] {
            // Determine if this is a time-based query
            const isTimeBased =
                query?.includes('on:') || query?.includes('after:') || query?.includes('before:');

            if (isTimeBased && transposed) {
                // Period/Cumulative format - load from fixture
                try {
                    const currentDir = dirname(fileURLToPath(import.meta.url));
                    return loadBalanceMatrixPeriod(currentDir);
                } catch {
                    // Fallback hardcoded data if fixture loading fails
                    return [
                        ['', '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'],
                        ['Cash', 5000.0, 6200.0, 5900.0, 8400.0, 8250.0],
                        ['Accounts Receivable', 0.0, 0.0, 0.0, 0.0, 0.0],
                        ['Service Revenue', -5000.0, -1200.0, 0.0, -2500.0, 0.0],
                        ['Office Rent', 0.0, 0.0, 300.0, 0.0, 150.0],
                    ];
                }
            } else {
                // Total format - load from fixture or generate from balances
                try {
                    const currentDir = dirname(fileURLToPath(import.meta.url));
                    const fixtureMatrix = loadBalanceMatrixTotal(currentDir);

                    // If balance count differs from fixture, generate matrix from them
                    if (balances.length !== fixtureMatrix.length) {
                        const matrix: any[][] = [];
                        balances.forEach(balance => {
                            const balanceValue = parseFloat(balance.balance);
                            matrix.push([balance.account.name || '', balanceValue]);
                        });
                        return matrix;
                    }

                    return fixtureMatrix;
                } catch {
                    // Fallback to generating from balances
                    const matrix: any[][] = [];
                    balances.forEach(balance => {
                        const balanceValue = parseFloat(balance.balance);
                        matrix.push([balance.account.name || '', balanceValue]);
                    });
                    return matrix;
                }
            }
        },
    };
}

function getPropertyKeys(properties?: { [name: string]: string }): string[] {
    return Object.keys(properties ?? {}).sort();
}

function createMockBookBase(bookData: BookData): MockBook {
    const mockBook: MockBook = {
        json: (): BookData => bookData,
        getId: (): string => bookData.id ?? '',
        getName: (): string => bookData.name ?? '',
        getCollection: () => {
            if (!bookData.collection) {
                return undefined;
            }
            return {
                getName: (): string | undefined => bookData.collection?.name,
            };
        },
        getDatePattern: (): string => bookData.datePattern ?? '',
        getDecimalSeparator: (): string => bookData.decimalSeparator ?? '',
        getFractionDigits: (): number | undefined => bookData.fractionDigits,
        getPeriod: (): string | undefined => bookData.period,
        getOwnerName: (): string | undefined => bookData.ownerName,
        getPropertyKeys: (): string[] => getPropertyKeys(bookData.properties),
        getProperties: (): { [name: string]: string } => ({ ...(bookData.properties ?? {}) }),
        createTransactionsDataTable: (transactionsToBuild, account) =>
            new TransactionsDataTableBuilder(
                mockBook as unknown as Book,
                transactionsToBuild,
                account
            ),
    };
    return mockBook;
}

function getTransactionStatus(transactionData: TransactionData): string {
    if (transactionData.trashed) {
        return 'TRASHED';
    }
    if (!transactionData.posted) {
        return 'DRAFT';
    }
    if (transactionData.checked) {
        return 'CHECKED';
    }
    return 'UNCHECKED';
}

function createMockTransaction(transactionData: TransactionData): MockTransaction {
    return {
        json: (): TransactionData => transactionData,
        getId: (): string | undefined => transactionData.id,
        getStatus: (): string => getTransactionStatus(transactionData),
        getDateObject: (): string => transactionData.date ?? '',
        getDateFormatted: (): string | undefined => transactionData.dateFormatted ?? transactionData.date,
        getCreditAccountName: async (): Promise<string | undefined> =>
            transactionData.creditAccount?.name ?? '',
        getDebitAccountName: async (): Promise<string | undefined> =>
            transactionData.debitAccount?.name ?? '',
        getDescription: (): string | undefined => transactionData.description,
        getAmount: (): Amount | undefined =>
            transactionData.amount && transactionData.amount.trim() !== ''
                ? new Amount(transactionData.amount)
                : undefined,
        getCreatedAt: (): Date | string =>
            transactionData.createdAt ? new Date(Number(transactionData.createdAt)) : '',
        getCreatedAtFormatted: (): string =>
            transactionData.createdAt ? new Date(Number(transactionData.createdAt)).toISOString() : '',
        getPropertyKeys: (): string[] => getPropertyKeys(transactionData.properties),
        getProperty: (key: string): string | undefined => transactionData.properties?.[key],
        getRemoteIds: (): string[] => transactionData.remoteIds ?? [],
        getUrls: (): string[] => transactionData.urls ?? [],
        getFiles: (): Array<{ getUrl(): string | undefined }> => [],
        getAccountBalance: async (): Promise<Amount | undefined> => undefined,
    };
}

// Factory for creating MockBkper instances for books listing
export function createMockBkperForBooks(books: BookData[]): MockBkper {
    return {
        setConfig: () => {},
        getBooks: async (query?: string): Promise<MockBook[]> => {
            let filteredBooks = books;

            // Apply name filtering if query is provided
            if (query && query.trim()) {
                filteredBooks = books.filter(
                    (book: BookData) =>
                        book.name?.toLowerCase().includes(query.toLowerCase()) || false
                );
            }

            return filteredBooks.map((bookData: BookData) => createMockBookBase(bookData));
        },
    };
}

// Factory for creating MockBkper instances for single book operations
export function createMockBkperForBook(
    books: BookData[],
    accounts?: AccountData[],
    transactions?: TransactionData[],
    accountBalances?: AccountBalanceData[],
    groups?: GroupData[]
): MockBkper {
    return {
        setConfig: () => {},
        getBook: async (id: string): Promise<MockBook> => {
            const book = books.find(b => b.id === id);
            if (!book) {
                throw new Error(`Book not found: ${id}`);
            }

            return {
                ...createMockBookBase(book),

                // Accounts support
                getAccounts: accounts
                    ? async (): Promise<MockAccount[]> =>
                          accounts.map((accountData: AccountData) => ({
                              json: (): AccountData => accountData,
                              getId: (): string => accountData.id || '',
                              getName: (): string => accountData.name || '',
                              getType: (): string => accountData.type || '',
                          }))
                    : undefined,

                // Account Balances support
                getBalancesReport: accountBalances
                    ? async (query?: string): Promise<any> => {
                          let filteredBalances = accountBalances;

                          // Handle query filtering - empty/undefined queries use 'on:$m' default
                          const effectiveQuery = query || 'on:$m';
                          if (
                              effectiveQuery &&
                              effectiveQuery.trim() &&
                              effectiveQuery !== 'on:$m'
                          ) {
                              // Simple query simulation for testing
                              if (effectiveQuery.includes("account:'Cash'")) {
                                  filteredBalances = accountBalances.filter(
                                      b => b.account.name === 'Cash'
                                  );
                              } else if (effectiveQuery.includes("group:'Assets'")) {
                                  filteredBalances = accountBalances.filter(
                                      b => b.account.type === 'ASSET'
                                  );
                              } else if (effectiveQuery.includes("group:'Liabilities'")) {
                                  filteredBalances = accountBalances.filter(
                                      b => b.account.type === 'LIABILITY'
                                  );
                              }
                          }
                          // For 'on:$m' default or other date queries, return all balances (no filtering in mock)

                          return {
                              getBalancesContainers: (): MockAccountBalance[] => {
                                  const containers = filteredBalances.map(
                                      (balanceData: AccountBalanceData) => ({
                                          json: (): AccountBalanceData => balanceData,
                                          getAccount: (): MockAccount => ({
                                              json: (): AccountData => balanceData.account,
                                              getId: (): string => balanceData.account.id || '',
                                              getName: (): string => balanceData.account.name || '',
                                              getType: (): string => balanceData.account.type || '',
                                          }),
                                          getGroup: (): MockGroup | null => null,
                                          getName: (): string => balanceData.account.name || '',
                                          getPeriodBalance: (): string => balanceData.balance,
                                          getCumulativeBalance: (): string =>
                                              balanceData.cumulative,
                                          createDataTable: (): MockDataTableBuilder =>
                                              createMockDataTableBuilder(
                                                  filteredBalances,
                                                  effectiveQuery
                                              ),
                                      })
                                  );

                                  // For matrix functionality, we need to add createDataTable to the first container
                                  // This simulates the real API where you call it on the first container or the report
                                  if (containers.length > 0) {
                                      containers[0].createDataTable = () =>
                                          createMockDataTableBuilder(
                                              filteredBalances,
                                              effectiveQuery
                                          );
                                  }

                                  return containers;
                              },
                              createDataTable: (): MockDataTableBuilder =>
                                  createMockDataTableBuilder(filteredBalances, effectiveQuery),
                          };
                      }
                    : undefined,

                // Transactions support
                listTransactions: transactions
                    ? async (query?: string, limit?: number, cursor?: string): Promise<MockTransactionIterator> => {
                          let filteredTransactions = transactions;

                          if (query) {
                              // Simple query simulation for testing
                              if (query.includes('posted:true')) {
                                  filteredTransactions = transactions.filter(
                                      t => t.posted === true
                                  );
                              } else if (query.includes('posted:false')) {
                                  filteredTransactions = transactions.filter(
                                      t => t.posted === false
                                  );
                              } else if (query.includes("account:'Cash'")) {
                                  filteredTransactions = transactions.filter(
                                      t =>
                                          t.creditAccount?.name === 'Cash' ||
                                          t.debitAccount?.name === 'Cash'
                                  );
                              }
                          }

                          // Simple cursor-based pagination simulation
                          let startIndex = 0;
                          if (cursor) {
                              try {
                                  const cursorData = JSON.parse(
                                      Buffer.from(cursor, 'base64').toString()
                                  );
                                  startIndex = cursorData.offset || 0;
                              } catch {
                                  startIndex = 0; // Invalid cursor, start from beginning
                              }
                          }

                          const pageSize = limit || 50;
                          const endIndex = startIndex + pageSize;
                          const pageTransactions = filteredTransactions.slice(startIndex, endIndex);
                          const hasMore = endIndex < filteredTransactions.length;
                          const nextCursor = hasMore
                              ? Buffer.from(
                                    JSON.stringify({ offset: endIndex, timestamp: Date.now() })
                                ).toString('base64')
                              : undefined;

                          const pageItems = pageTransactions.map((transactionData: TransactionData) =>
                              createMockTransaction(transactionData)
                          );

                          return {
                              hasNext: (): boolean => Boolean(nextCursor),
                              next: (): MockTransaction[] => pageItems,
                              getItems: (): MockTransaction[] => pageItems,
                              getCursor: (): string | undefined => nextCursor,
                              getAccount: async () => undefined,
                          };
                      }
                    : undefined,

                // Groups support
                getGroups: groups
                    ? async (): Promise<MockGroup[]> => {
                          // Create a map for quick parent lookup
                          const groupMap = new Map<string, MockGroup>();
                          const mockGroups: MockGroup[] = [];

                          // First pass: create all mock groups
                          groups.forEach((groupData: GroupData) => {
                              const mockGroup: MockGroup = {
                                  getId: (): string => groupData.id || '',
                                  getName: (): string => groupData.name || '',
                                  getType: (): string => groupData.type || '',
                                  isHidden: (): boolean => groupData.hidden || false,
                                  isPermanent: (): boolean => groupData.permanent || false,
                                  getParent: (): MockGroup | null => null, // Will be set in second pass
                                  getChildren: (): MockGroup[] => [], // Will be populated in second pass
                                  getProperties: (): { [name: string]: string } =>
                                      groupData.properties || {},
                                  json: (): GroupData => groupData,
                              };

                              mockGroups.push(mockGroup);
                              if (groupData.id) {
                                  groupMap.set(groupData.id, mockGroup);
                              }
                          });

                          // Second pass: set up parent-child relationships
                          groups.forEach((groupData: GroupData, index: number) => {
                              const mockGroup = mockGroups[index];

                              // Set parent
                              if (groupData.parent?.id) {
                                  const parent = groupMap.get(groupData.parent.id);
                                  if (parent) {
                                      mockGroup.getParent = () => parent;
                                  }
                              }

                              // Collect children
                              const children = mockGroups.filter(
                                  (child, childIndex) =>
                                      groups[childIndex].parent?.id === groupData.id
                              );
                              mockGroup.getChildren = () => children;
                          });

                          return mockGroups;
                      }
                    : undefined,
            };
        },
    };
}
