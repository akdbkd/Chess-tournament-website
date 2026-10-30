export type Role = "USER" | "ORGANIZER" | "ADMIN";
export type Tournament = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: "Rapid" | "Blitz" | "Bullet" | "Classical";
  format: string;
  time_control: string;
  starts_at: string;
  registration_closes: string;
  capacity: number;
  participants: number;
  fee_paise: number;
  prize_paise: number;
  min_rating: number;
  max_rating: number;
  min_account_days: number;
  status: string;
  organizer_id: string | null;
  organizer_name: string;
  chess_url: string;
  auto_approve: boolean;
  featured: boolean;
  color: string;
};
export type ChessPlayer = {
  username: string;
  rating: number | null;
  joined: number;
  title?: string;
  country?: string;
  url: string;
};
export type Registration = {
  id: string;
  tournament_id: string;
  registered_by: string;
  username: string;
  rating: number | null;
  status: string;
  payment_status: string;
  created_at: string;
  checked_in_at?: string;
  tournament?: Tournament;
};
export type Profile = {
  id: string;
  display_name: string;
  role: Role;
  email?: string;
};
export type Post = {
  tournament_id?: string | null;
  id: string;
  author_id: string;
  author_name: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
  likes: number;
  locked?: boolean;
  hidden?: boolean;
};
export type Comment = {
  id: string;
  post_id: string;
  author_name: string;
  body: string;
  created_at: string;
};
export type Standing = {
  tournament_id: string;
  username: string;
  score: number;
  wins: number;
  draws: number;
  losses: number;
  tiebreak: number;
};
export type Notice = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};
