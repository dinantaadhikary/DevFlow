import { query } from "../config/db";

export interface User {
  id: string;
  organization_id: string;
  email: string;
  password_hash: string;
  full_name: string;
  avatar_url: string | null;
  role: "owner" | "admin" | "developer" | "viewer";
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export const UserModel = {
  async findByEmail(email: string): Promise<User | undefined> {
    const rows = await query<User>("SELECT * FROM users WHERE email = $1", [email]);
    return rows[0];
  },

  async findById(id: string): Promise<User | undefined> {
    const rows = await query<User>("SELECT * FROM users WHERE id = $1", [id]);
    return rows[0];
  },

  async create(data: {
    organizationId: string;
    email: string;
    passwordHash: string;
    fullName: string;
    role: string;
  }): Promise<User> {
    const rows = await query<User>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.organizationId, data.email, data.passwordHash, data.fullName, data.role]
    );
    return rows[0];
  },

  async updateLastSeen(id: string): Promise<void> {
    await query("UPDATE users SET last_seen_at = now() WHERE id = $1", [id]);
  },

  async listByOrganization(organizationId: string): Promise<User[]> {
    return query<User>(
      "SELECT id, email, full_name, avatar_url, role, last_seen_at FROM users WHERE organization_id = $1",
      [organizationId]
    );
  },
};
