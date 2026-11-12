export type SwipeAction = "LIKE" | "PASS";

export interface MatchRecord {
  id: string;
  userAId: string;
  userBId: string;
  createdAt: Date;
}

export interface SwipeOutcome {
  action: SwipeAction;
  matched: boolean;
  match: MatchRecord | null;
}