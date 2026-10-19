-- Let local scripts (service role: seed, eval fixtures) insert posts directly while the
-- posts_guard trigger still checks them. The trigger runs its checks with the inserting
-- role's rights; private.has_contact_details was callable by no client role, which also
-- blocked the service role. Client roles (anon, authenticated) stay without access.
grant execute on function private.has_contact_details(text) to service_role;
