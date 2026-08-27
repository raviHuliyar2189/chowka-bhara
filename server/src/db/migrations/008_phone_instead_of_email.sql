-- Players are now identified by WhatsApp/phone number instead of email address (§13's account
-- model change, at explicit user request). The unique constraint on the column carries over
-- automatically with the rename — no data to migrate at the time of this change (the players
-- table was emptied via a separate full reset just before it).
alter table players rename column email to phone;
