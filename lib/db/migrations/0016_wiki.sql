CREATE TABLE IF NOT EXISTS "wiki_categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_external_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "wiki_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wiki_articles" (
  "id" serial PRIMARY KEY NOT NULL,
  "category_id" integer NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "content" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_external_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wiki_articles_category_id_wiki_categories_id_fk') THEN
    ALTER TABLE "wiki_articles"
      ADD CONSTRAINT "wiki_articles_category_id_wiki_categories_id_fk"
      FOREIGN KEY ("category_id") REFERENCES "public"."wiki_categories"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wiki_categories_slug_unique"
  ON "wiki_categories" ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wiki_articles_slug_unique"
  ON "wiki_articles" ("slug");
--> statement-breakpoint
INSERT INTO "wiki_categories" ("slug", "name", "description", "sort_order")
VALUES ('mission-values', 'Mission, Values & Team Code', 'Transform Church''s mission, core values, and the codes of conduct and leadership expectations that shape how staff and leaders operate.', 0)
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'mission-values-staff-team-code', 'Mission, Values & Staff Team Code', 'Transform Church''s mission statement, five core values, and the Staff Team Code that defines how our team operates together.', '## Mission

Transform Church exists to reach, teach, and empower people to live free in Christ and transform their world.

## Core Values

### Jesus First
- Jesus is at the center of all we do.
- It''s all for Him. It''s all about Him. It''s all because of Him.
- He is the source of our salvation and transformation, the pathway to God and the example we follow individually and as a church community.

### Honor Always
- We believe that honor is an expression of how we demonstrate God''s love towards one another.
- We choose honor through our speech and actions. This reflects His design as we follow the model for generosity by giving freely of our time, talents, and resources.

### Love Boldly
- We place high value on people who are not here yet.
- Reaching people far from God is the mandate of the local church, and the great commission of His people.
- We live our lives out deeply as followers of Christ, and sometimes that means getting uncomfortable so others may know Christ.
- We passionately value those who are here by leading them in grace & truth.

### Believe Big
- We live with the expectation that prayer changes everything. Therefore, we pray boldly, we pray like it matters and pray in the name of Jesus.
- We choose to speak life and elevate our faith to reflect the greatness of our God.
- Because He is a miracle-working God, our prayers, dreams, and faith are bold and expansive.

### Have Fun!
- We have outrageous contagious joy!
- The house of God is a house of prayer, worship and a house of joy!

## Staff Team Code

1. **Contagious Charisma** — Joyful, not a complainer or whiner. Leaves baggage at the door. Great to be around. Happy to be here.
2. **Relentless Grit** — Determination. Whatever it takes. Go above & beyond.
3. **Ever Increasing Agility** — Flexible. Adaptable. Responding quickly to changes.
4. **Unwavering Integrity** — Honesty, integrity. Wisdom. Accountability.
5. **Perpetual Growth** — Conferences, seminars, books, podcasts. Every sphere — we will develop and grow.
6. **Work Hard-Play Hard** — Individually. Together. Having fun!
7. **Intentional Team Loyalty** — Protect relationships (protect unity) — forgiveness, offense. Loyalty & faithfulness. Respect. Conflict resolution. Less me, more we — our language is always us, we, together, not I, me, myself.', 0
FROM "wiki_categories" c
WHERE c."slug" = 'mission-values'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'mission-values-staff-team-code');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'staff-leaders-code-of-conduct', 'Staff & Leaders Code of Conduct', 'Expectations for leaders at Transform Church around spirituality, unity, integrity, wisdom, and confidentiality.', 'While we can have many roles in life and ministry, we are Christians first — that hat never comes off. However, as leaders, there is an expectation of a higher caliber (James 3:1; 1 Timothy 3). Leaders are expected to live above reproach — higher living and a higher example.

## Spirituality

- Solid prayer life and walk with God.
- Tithe and offering. Tithe is obedience on all earnings, including anything you earn, such as salary, bonuses, and other work. Giving above that is the beginning of generosity. There is also an expectation to contribute to Transform Church initiatives, i.e. Giving Christmas Away, B&B, etc.
- **Accountability**: Having your "three." This is an expectation of all leaders at Transform Church, especially staff and Pastors. Who are your "three"? 1) Who is "above" you, pouring into you? 2) Who is beside you, walking with you? 3) Who are you mentoring and pouring into?

## Unity

- United with the vision of Transform Church under the direction of the Senior Pastors and loyal to her core values: Always Jesus first. We passionately value people. We are a house of honor. We have a culture of excellence. We believe BIG. We have fun.
- Discards a "they" mindset; works toward a "we" mindset.

## Integrity as a Lifestyle

- Self-control especially in the area of sexual purity, outbursts of anger, emotions, and spending.
- Staying away from sexual misconduct, which includes sex before marriage, extramarital affairs, any type of inappropriate sexual activity before marriage, developing relationships with people whom you are not dating, and engaging in pornography.
- Using influence humbly and with wisdom. Model trustworthiness, demonstrate your commitment to the House of God, and above all, reflect Christ. An abuse of authority is control.
- Honesty in paying taxes.
- Consistent with biblical principles, mainly those mentioned in 1 Timothy 3 — have one spouse, stay away from heavy drinking, be honest with money, and live a heterosexual lifestyle.
- No use of drugs of any kind, other than that which is prescribed by a doctor or is over-the-counter. Abuse of that prescribed or over-the-counter drug is against this code.
- No alcohol abuse or cigarette smoking.
- Foul language, gossip, and lying are unacceptable.
- Integrity in social media posts, including wisdom in what you post, who you follow, and what you allow others to see. Keeping posts modest and non-divisive.

## Wisdom

- One of the most important things leaders must exude is wisdom and discernment. Leaders should use discernment in various situations:
  - If you are married, use wisdom in how you communicate with the opposite sex, even for church or leadership matters. Please always use email for accountability.
  - Do not sleep over the house of the opposite sex.
  - One-on-one meetings are to be with the same gender behind closed doors.
- Use wisdom and let it guide you so that you do not put yourself in compromising situations.
- Use wisdom in handling conflicts with other leaders and people in your life.

## Confidentiality

- Leaders are to respect the integrity and protect those who serve alongside us and attend our church. We take seriously our obligation to safeguard information entrusted to us by others in moments of vulnerability and accountability.
  - Exceptions to this are when vicious gossip could be spread, or the life or welfare of any individual is threatened. Even so, that should always be reported to the right person.', 1
FROM "wiki_categories" c
WHERE c."slug" = 'mission-values'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'staff-leaders-code-of-conduct');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'leading-yourself', 'Leading Yourself', 'Guidance from the Leading at Transform Church training on personal faith, work and rest, lifestyle, dating, generosity, church attendance, loyalty, and social media as a leader.', '## The Leader and Faith

The servant leader is growing in Jesus and has a fresh, real and powerful faith.

It is faith that pleases God (Hebrews 11:6). For example, Abraham, Noah, Moses, Joshua, Gideon, Jeremiah, and the disciples all pleased God because of faith.

As leaders our relationship with God must be **fresh**. We are to be seeking "daily manna" from the Lord. As we engage faith in times of praise and worship, the Lord will meet us and refresh us. We pray continually. We thank God in all things.

Prayer, worship, and the Word need to be active in our life so we can lead ourselves and others well. Putting it simply: your devotional life is what will sustain your leadership. Have a plan of what you want to read, and stick to it. Memorize key scriptures that mean a lot to you, that help you know the Lord and help you lead your life and team effectively. Meditate on His Word day and night that you might live an overcoming Christian life. (Psalm 1, Joshua 1:8, Matthew 4:1-11)

Christian leaders are to be **real**. This means we don''t hide our secrets. We are accountable. Every man and woman should be accountable to a trusted, strong Christian in areas of his/her struggles — whether pornography, gossip, lying, the love of money, or an addiction.

James 5:16 tells us we are to confess our faults one to another and then we will be healed (this is not a one-time event).

We can expect His power to flow in us and through us when we keep our relationship with God fresh and relevant, when we are hearing His voice regularly, and when we are living authentic, accountable lives.

## Keeping a Faith-Filled Spirit

A faith-filled mindset is the key to fruitful leadership. Paul encouraged the church to think on things which are excellent and true. Be a leader that has a "can do and get to" spirit. Live it, model it to your family and your team. Never show up as the leader saying things like, "I can''t believe we have to be here so early." Each time we serve the Lord we must embrace a positive spirit.

Problems are our bread that make us stronger. Lead yourself to a positive place through praise, worship, and a positive confession when you find yourself getting negative. A negative leader takes people backwards and divides the house of God.

Resources: Joyce Meyer, *Managing Your Emotions*; John Maxwell, *The Winning Attitude*.

## Work & Rest

A leader demonstrates diligence at work and diligence while working for the Kingdom. Sacrifice is part of being a disciple, so expect serving to be hard sometimes. We will need to rely on Him to be able to serve Him joyfully.

Beware of the "Planning Center culture" that equals serving only when convenient.

> 1 Corinthians 15:58 — Therefore, my dear brothers and sisters, stand firm. Let nothing move you. Always give yourselves fully to the work of the Lord, because you know that your labor in the Lord is not in vain.

It is the responsibility of the leader to take enough time so that they don''t "hit a wall." Eating healthy, sleeping enough, and taking vacation help refresh us so we come back to serving and leading with enthusiasm. When we have a "have to" spirit instead of a "get to" spirit for a long period of time, we may need to evaluate our whole week and make necessary changes.

Understand your own capacity. To grow yourself, you have to know yourself. Some people are high-capacity people and just seem to be able to handle a lot more. Others can carry less weight. Know yourself.

For example, if you''re expected to be at Church by 7:30am for rehearsal and you''re out until 2 or 3am in the morning with friends, you will not come in with the same enthusiasm. If you continue to do this, you will lose enthusiasm and may even burn out. You need to manage your life well — this is your responsibility.

If you are married with children, find ways that serving God and building His house is just part of the rhythm of your life. Serving needs to come out of the overflow of your relationship with the Lord — if you''ve been serving for three months in a row and suddenly find you''ve lost passion, but you rarely have a quiet time, that is not surprising.

## Lifestyles of a Leader

The lifestyle of a leader is simply the lifestyle of a disciple. Paul prayed that the Church of Colossians "would live a life worthy of the Lord." If we live a life worthy of the Lord and keep a genuine relationship with Him as our focus, the lifestyles of a leader will take care of themselves. Our mindset should not be "I can''t do that because I''m in youth ministry or on the worship team" — it''s "I don''t do that, because I''m saved and I don''t live that way anymore."

If you are lacking conviction in certain areas that the Lord calls us out of, it''s a good indication that you are lacking intimacy with the Holy Spirit and have hardened your heart. See Galatians 5:19-21 for outward behaviors to remove from our lives as a new creation:

> "When you follow the desires of your sinful nature, the results are very clear: sexual immorality, impurity, lustful pleasures, idolatry, sorcery, hostility, quarreling, jealousy, outbursts of anger, selfish ambition, dissension, division, envy, drunkenness, wild parties, and other sins like these. Let me tell you again, as I have before, that anyone living that sort of life will not inherit the Kingdom of God."

## Dating and Relationships

In almost every letter of the New Testament, sexual immorality is strongly warned against. We must model the way here. We don''t live together before we are married, and we live with strong boundaries with the people we are dating and engaged to, so we can see the full blessing of the Lord in our relationships.

We are accountable in this area so that we don''t get led astray. A Christian dates other Christians who are moving forward in their relationship with the Lord so they are equally yoked. We have a culture of acceptance, but not of approval. Everyone is always welcome at our Church, but Transform Church embraces everyone while never condoning sex outside of marriage or same-sex dating/marriage.

A Christian who is living together with another person will be encouraged to marry or separate and be abstinent pre-marriage. Leaders are to model the way by example, including in what they watch privately and with others from the Church — sex scenes on TV should be skipped, and wisdom used in the types of TV and movies we watch. Being accountable in areas of the internet is also a great way to model transparency and accountability.

Leadership at the end of the day is about being an example. People don''t do what you say, they do what they see.

## Generosity

Tithes, offerings, and Spirit-led generosity are all part of the normal Christian life. Jesus said where our treasure is, there our heart is. When we give less than the tithe, we are shifting trust from the God who made us to our own personal effort. Settle this quickly in your heart, and if this is an area of struggle, read *The Blessed Life* by Robert Morris or *God''s Economic Engine* (Tithing in the New Testament) by Scott Wilson.

Leaders:
1. Plan to be generous (wise budgeting, consistent tithing).
2. Are Spirit-led givers (offerings).
3. As God prospers them, they should become more and more generous as time passes — sacrificial givers (1 Timothy 6:17-18), giving both to the house of God, to the poor, and to others (Luke 12:33-34).

## Church Attendance

We strongly encourage leaders to sit in one service and serve in one service. Don''t just serve — make sure you''re hearing the preaching of the Word from the pastors and are in worship yourself. Leaders that are "so busy" they never get to hear preaching are being foolish.

Model the way and encourage your area of influence to attend as well. Missing Church should be a rarity for any follower of Christ. Leadership nights are an expectation of every leader, as this is the night where we specifically plan teachings around investing in your leadership. Leaders are early to church, connect with people, sit in the front, take notes in church, and engage their faith to meet with the Lord during Praise and Worship and giving time.

## Loyalty to Leadership and Transform Church

The devil wants people divided through disloyalty. When you have a problem with leadership you are to share your concerns with an UP leader (your department/team lead), not downward to people you lead. Sharing concerns with the person who oversees a situation is a good conversation; sharing those concerns with the people you lead instead is disloyal — it scatters sheep. It is critical to share concerns with the right people.

Transform Church, or any church, is not a perfect church — there is no such thing. We pray we will always be a healthy Church, with integrity and a deep love for people while being faithful to the vision God has given us to reach, teach, and empower people to impact their generation for Christ.

## Social Media

Social media is a great tool that allows us to stay connected, learn, and celebrate each other as we serve together to bring glory and honor to God. Our social media, like everything we do or say, represents Jesus, our church, our leadership, and ourselves. Keep the following in mind as a Christian and a leader at Transform Church:

- Am I posting, liking, or following content that aligns with biblical principles and what we believe as a church? Stay away from posting or liking clothing, speech, drug use or paraphernalia, excessive drinking, or public displays of affection that seem sexual in nature — and it''s best not to follow people who consistently post inappropriate content.
- Am I commenting inappropriately on any posts or direct messages? We should avoid commenting positively or negatively on anyone''s physical appearance or attractiveness, whether we know them personally or not — this is even more crucial for those in committed relationships or married. Direct messages and one-on-one conversations are still leadership moments; always be uniting and honoring in all communications, regardless of platform or visibility.
- What is the purpose of my post? Am I using my platform to cause division, tear people down, vent, and complain — or to uplift, encourage, and celebrate? We are a house of honor; we do not tear people down or speak negatively of people, leadership, other churches, or ministries on social media. We avoid pointless arguments that lead to confusion and distraction, and use our social media to encourage, uplift, and celebrate the house of God and our families and friends.', 2
FROM "wiki_categories" c
WHERE c."slug" = 'mission-values'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'leading-yourself');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'leading-people', 'Leading People', 'Guidance from the Leading at Transform Church training on culture, building and developing a team, running great meetings, handling negativity, and mentoring future leaders.', '## Culture

Culture is what we teach, model, allow, and celebrate. The leader teaches, models, and celebrates the culture we desire to see. We are a church that is FRESH (not stale), REAL (relating to real needs), and POWERFUL (full of life and believing for more of God).

The culture of our Church is dictated by our values:
1. Always Jesus First
2. We Passionately Value People
3. We Are a House of Honor
4. We Believe BIG
5. We Have Fun

## Building a Team

**How do I get people on my team?**

1. **Recruit**
   - How someone is asked to join the team is important — it can''t be a desperate ask or a favor. This is an opportunity to be a disciple and serve God, not about doing someone a favor.
   - Make the "ask" exciting and let them know what they will be doing.
   - Realize that most people need an individual ask from someone in order to start serving.
   - Example: "I''ve noticed you coming to church for the last few months and I think you could make a great impact on the production team. Would you pray about serving for the next 7 days and I''ll talk to you next week and see if that is something you would be interested in?"

2. **Train**
   - Consider creating a "Welcome to the Team" packet — a postcard, a gift from the church, and important vision about the team.
   - Give them a great experience and introduce them to people.
   - Make sure you, or a solid person who represents the team and culture well, does the training, and meets the new person at the right place and time — don''t be late, or you''ll teach them a culture of being late.
   - Their first day should be with you or someone else strong who can teach them what to do.
   - Have consistent training for the first few weeks to help them feel comfortable and part of the team.

3. **Clear expectations**
   - If what they are supposed to do is unclear, they will get nervous or frustrated.
   - People want to do a good job, so we need to set them up for success.
   - Follow your area''s training manual step by step (is your manual up to date? do you even have one?).

4. **Follow up / check in**
   - See how people are after their first day of serving, and check in after the 2nd and 3rd times as well.
   - Check in with the person training them.
   - Thank and encourage them when you check in.

**How do I continue to develop a team that lasts?**

1. **Value your team** — value the team member and the task, but never allow a task to be above a person.
2. **Build and facilitate relationships** — ask questions and genuinely care about people.
3. **Create a positive, encouraging team culture** — always start with the wins and great things happening in the life of our church.
4. **Make room for leadership experiences** — it is impossible to learn leadership without leading. Create low-risk opportunities for potential leaders to start leading; real leadership opportunities are different than just delegating a task — people must feel the weight of responsibility.
5. **Grow with your people** — never stop growing yourself; if people see their leader growing, they will keep growing.
6. **Empower your people to lead** — release people to lead at a higher level while still supporting them, or they will never know their full potential.

## Ingredients to Leading a Productive & Great Meeting

1. **Environment** — Use clean environments free from distractions. Snacks and music help make an attractive place people want to be.
2. **The first 10-15 minutes** — Greet everyone; start the meeting on time to honor people''s time and to teach latecomers that meetings start on time.
3. **Devotional** — A scripture or devotional helps people stay on vision. Always start with prayer.
4. **Agenda** — Have a typed-out agenda of what will be discussed so you can navigate the meeting effectively.
5. **Wins/Improves** — Start with wins, then discuss improvements. People must take responsibility for their part in a problem, without being crushed for mistakes. Keep a record of wins and improvements for the team.
6. **Navigating push back** — Questions are opportunities to coach your team. Handle financial questions with a spirit of faith and unity — charges to events help cover the true cost and make it excellent, and the church budgets to cover people who truly can''t afford it. If a person continues to press a negative issue, grab 10 minutes with them after the meeting to get to the bottom of it.
7. **Who does what by when** — The meeting must have next steps: who is directly responsible, and by what date. The leader holds people accountable to the dates and follows up so the team moves forward.

## Dealing with Negativity, Gossip & Confrontation

Negativity is poison to a family or a church. Leaders cannot allow negativity to affect their outlook — negativity regarding serving, the church, or leadership must be confronted.

**How do you confront it well?**
1. Don''t do it in an email.
2. It is best face to face; if you have to do it before you can see the person, do it on the phone.
3. Thank the person for serving. Affirm that you believe in them and love them, then ask what''s going on.
   - Allow them to talk, and ask how you can pray for them.
   - Let them know how this affects the team, and that you''re bringing it up because you want them to fulfill their potential.
   - Leave with next steps — how is their devotional time, what book could help (e.g. *The Battlefield of the Mind* by Joyce Meyer), and what scriptures could they memorize?

Gossip is exceptionally dangerous — it brings people down and is often distorted reality or lies. Gossip is not tolerated at Transform Church, and it is the leader''s role to stop it immediately after finding out about it. At Transform Church, we speak the best of people; if we need to pray for a situation, we will, but we can''t speak badly about people.

## Mentoring & Leading at a Higher Level

Running a great Transform Group, dream team, or department is only half the job of a leader — the other half is the training and development of people on the team who can become leaders. This must be intentional, consistent, and strategic. Leaders must look for the gold in people and be willing to invest in their discipleship and leadership potential.

Practically, this looks like:
1. Choose 1-3 people you see potential in. After a team meeting, have them stay for 15 minutes and encourage them that you believe God could use them to lead in the future — walk them through the wins and improves from the meeting.
2. Invest relationally in these people — have them over for dinner, hang out socially, and pray for areas they need to grow in.
3. Discipleship is the Great Commission — it is not enough to be discipled through Church and Bible study; we must invest our lives in others.
4. Encourage people you see potential in to attend Thrive, then point them to their next step: getting baptized, regular time with God, learning to hear His voice, Transform Church College, etc.
5. Who has potential? Everyone — but look for people who show a desire to grow in God and connect well with people.', 3
FROM "wiki_categories" c
WHERE c."slug" = 'mission-values'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'leading-people');
--> statement-breakpoint
INSERT INTO "wiki_categories" ("slug", "name", "description", "sort_order")
VALUES ('employee-handbook', 'Employee Handbook', 'The full Transform Church Employee Handbook, split by section, covering employment terms, compensation, benefits, leave, conduct standards, and policies.', 1)
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-forward-mission-core-values', 'Employee Handbook: Forward, Mission & Core Values', 'Introduction to the Employee Handbook and Transform Church''s mission, core values, and Staff Team Code.', '## Forward

This handbook contains Transform Church''s policies, procedures, practices, and benefits. It outlines what staff members can expect from the church and the obligations assumed as a staff member. All staff members are expected to become familiar with the policies, procedures, practices, and benefits of the church. Please talk with your oversight if you have any questions or need additional information concerning any policy or procedure.

Nothing contained in this handbook is intended to create a contract (express or implied), or otherwise to create legally enforceable obligations on the part of Transform Church and its staff members.

Because Transform Church is a growing church, it reserves full discretion to add, modify, or delete provisions of this handbook at any time without advance notice. For this reason, staff members should check with their oversight to obtain current information regarding the status of any particular policy, procedure, or practice. No individual other than the Pastors has the authority to enter into an employment agreement or any agreement that modifies church policy — any such modification must be in writing and signed by one of the Pastors.

Should the descriptions in this handbook differ with any formal agreement or document, the formal agreement or document shall prevail. All provisions are to be observed, administered, and construed in accordance with all applicable local, state, and federal laws, and are to be modified without notice accordingly.

The policies, procedures, practices, and benefits described in this handbook replace all earlier written and unwritten ones.

## Mission

Transform Church exists to reach, teach, and empower people to live free in Christ and transform their world.

## Core Values

1. **Jesus First** — Jesus is at the center of all we do. It''s all for Him, all about Him, all because of Him. He is the source of our salvation and transformation, the pathway to God, and the example we follow.
2. **Honor Always** — Honor is an expression of how we demonstrate God''s love toward one another, through our speech and actions, giving freely of our time, talents, and resources.
3. **Love Boldly** — We place high value on people who are not here yet. Reaching people far from God is the mandate of the local church. We live deeply as followers of Christ and passionately value those who are here by leading them in grace & truth.
4. **Believe Big** — We live with the expectation that prayer changes everything. We speak life and elevate our faith to reflect the greatness of our God. Our prayers, dreams, and faith are bold and expansive.
5. **Have Fun!** — We have outrageous contagious joy! The house of God is a house of prayer, worship, and joy.

## Staff Team Code

1. **Contagious Charisma** — Joyful, not a complainer or whiner. Leaves baggage at the door. Great to be around. Happy to be here.
2. **Relentless Grit** — Determination. Whatever it takes. Go above & beyond.
3. **Ever Increasing Agility** — Flexible. Adaptable. Responding quickly to changes.
4. **Unwavering Integrity** — Honesty, integrity. Wisdom. Accountability.
5. **Perpetual Growth** — Conferences, seminars, books, podcasts. Every sphere — we will develop and grow.
6. **Work Hard-Play Hard** — Individually. Together. Having fun!
7. **Intentional Team Loyalty** — Protect relationships (protect unity) — forgiveness, offense. Loyalty & faithfulness. Respect. Conflict resolution. Less me, more we — our language is always us, we, together, not I, me, myself.', 0
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-forward-mission-core-values');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-employment-orientation-immigration', 'Employment: Orientation, At-Will Status & Immigration Compliance', 'How new-hire orientation works, what employment-at-will means at Transform Church, and immigration/work-authorization requirements.', '## Orientation

Following the acceptance of employment, the appropriate oversight will discuss job duties and areas of responsibility with a new employee. Church policies and procedures will also be reviewed. A copy of the handbook will be given to each staff member to read and review.

Two copies of an Acknowledgment of Receipt and Understanding statement will be included in your employment package. After reviewing the handbook, each staff member must sign both statements acknowledging receipt and understanding of the handbook''s contents. One signed/witnessed copy will be returned to the employee and the other filed in the employee file. These statements must be returned to your oversight **within five (5) days** of employment.

This handbook is strictly confidential and is the property of Transform Church. Any duplication or conveyance to unauthorized parties is expressly prohibited.

## Employment at Will

Employment is a mutual consent between you and Transform Church. You have the right to terminate the employment relationship at any time, and Transform Church is free to end the employment relationship with you at any time, for any reason, with or without cause or advance notice, as long as we do not violate applicable federal or state laws. This "at will" relationship remains in effect throughout your employment unless specifically modified by an express written agreement signed by you and an authorized representative of Transform Church. It shall not be modified by any oral or implied agreement.

## Immigration Law Compliance

Transform Church is committed to employing U.S. citizens and aliens who are authorized to work in the United States, and will not unlawfully discriminate on the basis of citizenship or national origin.

As a condition of employment, and in compliance with the Federal Immigration Reform and Control Act (IRCA) of 1986, each staff member must complete an Employment Eligibility Verification form (**Form I-9**) and present documents that establish identity and employment eligibility. If proper identity and employment eligibility documents are not provided, employment may be terminated.', 1
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-employment-orientation-immigration');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-employee-classifications-work-schedule', 'Employee Classifications & Work Schedule', 'Definitions of full-time, part-time, exempt, non-exempt, temporary, and contract staff, plus office hours, attendance rules, and comp time.', '## Employee Classifications

Employees are divided into the following categories for the purpose of compensation and benefit eligibility. Church policies apply to all categories of staff members.

- **Regular Full-Time Pastoral Staff** — regularly scheduled to work forty to fifty (40-50) hours per week.
- **Regular Full-Time Employee** — regularly scheduled to work forty (40) hours per week.
- **Regular Part-Time Employee** — generally works less than forty (40) hours per workweek.
- **Exempt (Overtime Compensation)** — paid on a salary basis. Employees hired full-time (40+ hours/week) for a continuous and indefinite period are full-time exempt for compensation and benefit purposes, and are classified as exempt from overtime compensation.
- **Non-exempt (Overtime Compensation)** — protected by New Jersey wage and hour laws and the Fair Labor Standards Act (FLSA). Non-exempt employees are paid at least the minimum hourly wage and a premium rate for overtime — one and one-half times their regular rate for hours worked in excess of 40 in a workweek, per the FLSA. The FLSA does not require overtime pay for work on Saturdays, Sundays, holidays, or regular days of rest unless overtime hours are worked on those days. An employee''s oversight must approve overtime. Non-exempt employees hired for a continuous and indefinite period are considered full-time (more than 40 hours/week) or part-time (less than 40 hours/week), and are eligible for some benefits by specific reference only.
- **Temporary** — hired as a replacement for full-time or part-time employees for short periods (e.g. summer months, peak periods, vacations) or for a specified project. Temporary employees are not eligible for benefits regardless of hours or weeks worked.
- **Contract Labor (Independent Contractor)** — receives an hourly or flat rate per their employment agreement, is not required to work onsite, and may work for more than one organization or client. Payments are exempt from FICA withholding tax, and a completed 1099-MISC form is given to all contractors for work completed during the specified year.

## Work Schedule & Office Hours

### Hours

The church office hours are from **8:30am to 4:30pm Monday through Thursday** for regular staff, with a 1-hour lunch break. Staff arrive at **7:30am on Sunday morning** and are in the building for all Sunday services. A meal break is required if you work more than five hours a day; for non-exempt employees this time is not compensated. Your regular hours will be determined by your oversight based on the specifics of your job.

All staff are expected to attend and be involved at all major church events, including but not limited to all Sunday Services, Baptisms, Team Nights, Leader Nights, Christmas Eve Services, and Outreach events. When attending any service, event, or activity, you are always "on."

### Attendance and Punctuality

Punctuality and regular attendance are essential to the proper operation of the church. If you will be late or must leave prior to the end of your scheduled time, notify your oversight immediately. If you are unable to report to work for any reason, contact your oversight within **one hour** of the beginning of your scheduled workday; if unavailable, leave a voicemail and contact someone else in your department. It is your responsibility to keep your oversight informed daily during a short-term absence, and to provide medical verification when asked.

If you fail to notify your oversight after **two (2) consecutive days** absent, you may be considered to have voluntarily terminated.

### Unexcused Tardiness/Absence

A tardy or absence is "excused" only when you call ahead of time and it is for a compelling reason; otherwise it is "unexcused." Excessive tardiness and/or unexcused absences will not be tolerated, and employees are subject to disciplinary action such as docking of pay, suspension, or termination.

### Office Expectations

1. To help build and maintain a healthy team atmosphere, employees should plan to work in the office whenever their schedule allows.
2. Employees should get approval from their oversight when not working in the office during normal hours, and let them know when they expect to return.
3. When working outside the office during normal hours, employees should make themselves available for communication via phone and email.
4. Staff should always be available during work hours via phone, and on any day of an important event for work or church.

### Comp Time

Your job may require additional hours during certain seasons, and it''s common for staff members to work one or more evenings per week in addition to "all-church" events. Comp time, or "offset hours," can be given by the oversight to allow for a healthy work/life balance. Approval from your oversight is necessary prior to taking offset hours.', 2
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-employee-classifications-work-schedule');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-termination-records-grievance', 'Termination, Employee Records & Grievance Procedure', 'How separation from employment, resignations, discipline, and exit interviews work, how to update your employee record, and the three-step grievance procedure.', '## Termination of Employment

### Separation From Employment

An employee may separate from employment voluntarily or involuntarily by retirement, voluntary resignation, lack of work, or termination. Usually, before an employee is terminated, they will be told the reason(s); however, if misconduct is severe enough, the oversight has the authority to discharge the employee immediately.

An employee may be laid off due to changing business conditions that necessitate a reduction in staff. When a layoff is necessary, the Senior Pastor determines which employee shall be laid off. Severance pay, if any, is determined on an individual basis.

All church property in the employee''s possession must be returned to the immediate oversight upon separation, before the final paycheck is released.

### Resignations

We ask that an employee resigning give at least **two (2) weeks written notice**, including the reason for leaving. If you do not call in or report to work for two consecutive workdays, you may be considered to have voluntarily terminated without notice. Employees who give the requested two weeks'' notice will be paid for earned but unused vacation hours/days; in no situation will an employee be paid for unused sick leave. The final date to report to work is determined by the oversight and Senior Pastors in consultation with the employee.

### Standards of Conduct and Corrective Action

The church may terminate employment with or without cause and without notice at any time, and reserves the right to use intermediate disciplinary measures — verbal warnings, written warnings, suspension, and termination. Disciplinary action will be taken when inappropriate behavior or a violation of church policies occurs. In arriving at a decision, the following may be considered: the seriousness of the infraction, the employee''s past record, and the circumstances surrounding the matter.

### Exit Interview

An employee planning to resign may be asked to participate in an exit interview with their oversight and/or the Pastors, to discuss the reasons for leaving and arrange matters relating to final pay and other personal considerations.

### Pay at Time of Separation

The church will determine if the terminating employee has any outstanding debt owed to the church, and whether the individual has in their possession any church credit cards, keys, handbooks, or other church property.

## Employee Records

Each employee is responsible for notifying the office (**Hitalo Oliveira**) within **five (5) working days** of changes in address, telephone number, or family status (birth, marriage, death, divorce, legal separation, etc.), as income tax status may be affected. If you need to change your name and/or Social Security number, you will be asked to provide original documentation authorizing the change. Your employee file is maintained in the church office along with performance reviews.

Upon request, and in the presence of your HR representative, you may review any personnel records used to determine your qualifications for employment, promotion, compensation, termination, or other disciplinary action.

## Grievance Procedure

To use the grievance procedure effectively, become familiar with this Employee Handbook and refer to the specific section that relates to the grievance. If you have no direct oversight other than a senior staff member, eliminate Step One and start at Step Two. The procedure is available to all employees:

**Step One** — Submit a problem in writing to your immediate oversight within **three (3) days** after the problem becomes known. The oversight will attempt to resolve it at the first meeting; if not resolved, they will investigate further and meet with you to give an answer within **three (3) working days**. If your immediate oversight cannot resolve the problem, or the problem originated from the oversight, move to Step Two.

**Step Two** — Submit the grievance in writing to your Senior Staff within **three (3) working days** after receiving the Step One answer, and request a meeting within **three (3) working days**. If Leadership Staff cannot resolve the problem during the meeting, they will research it and give you a solution within **three (3) working days**.

**Step Three** — Request a review by the Senior Pastor within **three (3) working days** following the Step Two answer. The Senior Pastor will review the grievance and solution, meet with you if necessary, and render a final decision within **five (5) working days**.', 3
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-termination-records-grievance');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-compensation-payroll-overtime', 'Compensation: Payroll, Wages & Overtime', 'How payroll documentation, pay periods, payroll deductions, pay errors, wage increases, and overtime work at Transform Church.', '## Payroll

### Payroll Documentation

Following the acceptance of employment, the new hire will be given federal and state tax forms along with health insurance forms to complete. These, along with the employment application form and starting pay/date/benefit information, must be filled out during the first week of starting work.

### Pay Periods

The pay period for employees is **weekly, every Friday**, unless otherwise stated in the employment agreement or due to bank holidays.

### Payroll Deduction

The church will make arrangements for payroll deductions for:
1. Federal, state, and local income taxes
2. Social Security taxes
3. Employee portion of health insurance premiums

### Error in Pay

If a payroll error occurs, notify your HR representative. The church will make every attempt to adjust the error no later than the employee''s next regular pay period.

## Wage and Salary Increases

Wage and salary rates are reviewed once a year and adjusted if necessary; more frequent reviews may occur based on exceptional circumstances. Rates of increase are based on Cost of Living Allowance plus a determined amount proposed by oversight based on performance and responsibilities. All increases must be approved by the Transform Church Board.

## Overtime (Non-Exempt Employees)

Non-exempt (hourly) employees receive **1½ times** the regular rate of pay for all hours worked over 40 hours in a workweek. Overtime must be authorized in advance by your immediate oversight and/or senior staff member — you may not arbitrarily decide to work in excess of your normal schedule. Failure to obtain oversight permission to work overtime may result in disciplinary action up to and including termination.', 4
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-compensation-payroll-overtime');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-vacation-holiday-pay', 'Vacation & Holiday Pay', 'PTO accrual by years of service, how to request vacation, Sunday vacation limits by staff level, and the annual paid holiday schedule.', '## Vacation

- **1-5 years**: 15 days
- **Each year after**: 1 additional PTO day (max 20 days)

Full-time employees, whose employment agreement does not state otherwise, receive 15 days of PTO after completion of the **90-day introductory employment period**. The employee is eligible to take designated PTO corresponding to the number of weeks between the hire date and the end of the calendar year.

After 5 years of employment, an extra day of PTO is added for the full-time employee; each year thereafter, an extra day is added, up to a maximum of 20 days of PTO.

Part-time employees, whose employment agreement does not state otherwise, receive **10 days of PTO per year**. Employees who work less than 15 hours per week are considered hourly or contract employees and are only paid per hour worked; vacation time is not paid for them.

### Requesting Time Off

Requests for vacation time off must be in writing and submitted to your oversight for approval **at least ten (10) working days in advance**. If submitting a PTO form with less than 10 days'' notice, you must submit your request with plans. Vacations are granted with consideration to date of request, seniority, and staffing needs. Make every effort to avoid requesting PTO during a Level 2-Level 4 event (see staff calendar) unless it''s a special occasion or extenuating circumstance — to request time off during a Level 2-4 event, it must be submitted **3 weeks prior** to the event to ensure proper planning.

Vacation days do not accrue and must be used by the end of the calendar year. Non-exempt, temporary, and independent contractors are not allotted PTO days unless otherwise stated in their employment agreement.

## Weekend Vacations

Weekend services at Transform Church are a higher priority than other days. As a result, the number of days you can take as Sunday Vacation is limited based on staff level. All Sunday vacation days (including any additional requested days) must be approved by the employee''s oversight.

- **Executive / Senior Pastors**: as needed
- **Full-time Pastoral Staff**: 5 days
- **All Full-time Staff**: 5 days
- **Part-time Staff**: 5 days (based on Sunday responsibilities, determined by the oversight)

## Holiday Pay

Holiday pay is a day off from work with pay. Full-time employees are eligible to receive holiday pay on the following holidays:

- New Year''s Day (January) — 1 day
- MLK Day (January) — 1 day
- President''s Day (February) — 1 day
- Easter Monday (March/April) — 1 day
- Memorial Day (May) — 1 day
- Independence Day (July) — 1 day
- Labor Day (September) — 1 day
- Thanksgiving (November) — 2 days
- Christmas Eve/Day (December) — 2 days
- New Year''s Eve (December) — 1 day

Guidelines (note: weekend responsibilities may supersede these holidays, with advance notice given):
1. Holidays are observed on the calendar day they occur unless job responsibilities require otherwise; staff will receive notice of the day off.
2. If a holiday falls during an employee''s approved vacation period, the employee receives holiday pay and is not charged a vacation day for the holiday.
3. Holiday pay does not count as time worked for the calculation of overtime.', 5
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-vacation-holiday-pay');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-sick-maternity-paternity-leave', 'Sick Leave, Maternity & Paternity Leave (Handbook Summary)', 'The handbook''s summary of paid sick leave, plus the maternity and paternity leave benefits and how they interact with NJ state programs.', '## Sick Leave Pay

Sick leave pay is intended to help protect employees against loss of earnings because of personal illness or accident — it is not additional vacation or personal time off.

Full-time employees who have completed at least **ninety (90) days** of continuous service are eligible for **unlimited paid sick leave** during each calendar year. Sick leave benefits may only be used for personal illness or non-work-related injury. In cases of illness or injury requiring hospitalization and recuperation, full-time employees may request up to **sixty (60) days** of sick leave without pay after accumulated sick leave has been exhausted; a doctor''s release form is required to return to work.

When a close family member is ill and requires an employee to miss work, the employee may use sick leave days to care for them, with oversight approval.

Unused sick leave may not be used as personal time off or additional vacation, and employees are not paid for unused sick leave upon termination. Sick leave is not considered time worked for overtime calculation.

## Maternity Leave

Transform Church provides up to **three (3) months** of approved maternity leave, separate from accrued vacation or sick time and not extended beyond three months. This leave must be taken consecutively. Transform Church does not directly cover the full salary during this leave — employees must apply for New Jersey Temporary Disability Insurance (TDI) for the recovery period related to pregnancy and childbirth, then Family Leave Insurance (FLI) for bonding time. TDI/FLI provides up to **85%** wage replacement, and Transform Church supplements the remaining amount so the employee receives **100% salary** during the three months.

**Advance Payment Option**: if allowable, Transform Church may provide the supplemental salary difference in advance of TDI/FLI benefits to bridge the gap, which can take several weeks to begin. Employees are encouraged to submit the Transform Church **TDI/FLI Internal Request Form 90 days in advance** of intended leave.

**Extended Leave Requests**: requests for leave beyond three months are evaluated separately under regular time-off policies and role requirements, and are not part of the maternity leave benefit.

**Clarification of State Benefits vs. Transform Church Policy**: TDI and FLI are state-administered wage replacement programs, not a Transform Church benefit. While state programs may allow income benefits for longer periods, Transform Church''s policy does not provide job protection or salary supplementation beyond the approved three months.

## Paternity Leave

Transform Church provides up to **four (4) weeks** of paid paternity leave following the birth of a child, separate from accrued vacation or sick time and not extended beyond four weeks. This leave must be taken consecutively. Employees must apply for NJFLI, which provides up to **85%** wage replacement; Transform Church supplements the remaining amount so the employee receives **100% salary** during the four weeks.

**Advance Payment Option**: if allowable, Transform Church may provide the supplemental salary difference in advance of FLI benefits to bridge the gap. Employees are encouraged to submit the Transform Church **TDI/FLI Internal Request Form 90 days in advance** of intended leave, submitted to HR admin, Finance & Business Manager, and Operations Director.

**Extended Leave Requests**: requests beyond four weeks are evaluated separately under regular time-off policies and are not part of the paternity leave benefit.

**Clarification of State Benefits vs. Transform Church Policy**: FLI is a state-administered wage replacement program, not a Transform Church benefit, and does not provide job protection or salary supplementation beyond the approved four weeks.

See the "Maternity Leave Policy," "Paternity Leave Policy," and "NJ State Leave Benefits Reference" articles in the Time Off, Hours & Reviews category for full detail on the state TDI/FLI programs and the internal request form.', 6
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-sick-maternity-paternity-leave');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-personal-family-medical-study-leave', 'Personal, Family, Medical & Study Leave', 'Personal leave, FMLA family/medical leave, study leave for Senior Pastors, missions trip leave, ministry leave, and the general rules that apply to all leaves.', '## Personal Leave

A personal leave of absence is for a reason not family- or medically-related under the Family and Medical Leave Act of 1993 (FMLA). Full-time employees who have completed at least **twelve (12) months** of continuous service may submit a written request for unpaid personal leave, for up to a maximum of **thirty (30) calendar days**, after all earned vacation and holiday benefits have been exhausted. Written requests must state the reason and the beginning/ending dates.

Personal leave requests are granted at the discretion of the oversight and senior staff. Employees who return at the end of personal leave will normally be returned to their former job classification if an opening exists, or considered for a comparable position if available.

## Family/Medical Leave

An employee who has completed at least **twelve (12) months** of continuous service is eligible to receive unpaid family/medical leave under FMLA. Twelve (12) workweeks of leave in a twelve-month period may be taken only for:
1. The birth of a child, and to care for the newborn within one year of birth.
2. The placement of a child for adoption or foster care, and to care for the newly placed child within one year of placement.
3. To care for the employee''s spouse, child, or parent with a serious health condition.
4. A serious health condition of the employee preventing them from performing essential job tasks.
5. A qualifying exigency arising from the employee''s spouse, son, daughter, or parent being a covered military member on "covered active duty."
6. **Twenty-six (26) work weeks** of leave during a single 12-month period to care for a covered service member with a serious injury or illness (military caregiver leave), if the eligible employee is the service member''s spouse, son, daughter, parent, or next of kin.

Federal law does not require the church to grant more than twelve (12) weeks of unpaid leave in any consecutive twelve-month period. Leave for a family member''s serious health condition may be taken consecutively or intermittently. Leave due to birth or adoption must be taken consecutively (unless otherwise agreed) and completed within one (1) year of the birth or adoption.

During leave, the employer maintains the employee''s health care coverage under the same conditions as if continuously working; both employer and employee are responsible for their share of premiums. Eligible employees must provide reasonable prior written notice, and the church may require medical certification. Employees who are married may only take a total of 12 work weeks between the two of them. Where FMLA and this handbook conflict, FMLA prevails.

## Study Leave

Senior Pastors receive **two (2) weeks** of paid study leave per calendar year for personal growth and professional advancement, after one (1) full year of service. The Senior Pastor may extend leave to other senior staff as needed. No paid study leave is given to part-time employees.

## Missions Trips

Transform Church staff may go on **one missions trip per year** that does not count toward PTO days. This does not limit attending multiple trips — PTO time must be used for any trip beyond the first. Staff must still complete the application process and meet all Missions team requirements. Requests are first-come; complete the Missions Trips forms found in the staff shared drive''s "Request Time Off" folder, get approval from your oversight first, then submit to HR for final approval.

## Other Leaves

The Senior Pastor and Senior Staff may take up to **one (1) week** of Ministry Leave for assignments away from regular church duties, such as speaking or teaching. Senior Pastors and other pastoral/preaching staff are allowed time away to minister, preach, and teach at other churches as long as the local church remains healthy and flourishing. The employee''s oversight and the Senior Pastor must approve ministry leaves with written approval filed in their file, and the leave must not interfere with any ministry of Transform Church.

## All Leaves Guidelines

General provisions that apply to all personal and medical leaves of absence:
1. A request for an extension must be made in writing prior to the expiration date of the original leave, accompanied when appropriate by a physician''s written statement certifying the need for extension.
2. Failure to return to work on the first workday following an approved leave''s expiration may be considered a voluntary termination.
3. Employees must pay the entire premium for continued health insurance coverage during an approved leave.
4. If an extension is granted, the employee must continue to pay the entire insurance premium.
5. Employees on leave are subject to layoff on the same basis as employees actively at work.
6. Employees on leave must communicate with their oversight regularly, at least once each week, regarding status and anticipated return date.
7. Employees on leave who seek or accept other employment without the church''s prior written approval are subject to disciplinary action, up to and including termination.
8. Employees who falsify the reason for their leave are subject to disciplinary action, up to and including termination.
9. All leaves of absence must be approved in writing by either the Senior Pastor or designated oversight.', 7
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-personal-family-medical-study-leave');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-jury-bereavement-military-leave', 'Jury Duty, Bereavement & Military Leave', 'How to handle jury or witness duty, the bereavement pay schedule by family relationship, and military leave.', '## Jury/Witness Duty

Notify your immediate oversight upon receipt of a summons or subpoena so arrangements can be made to accommodate your absence. Submit a copy of your Jury Summons to your oversight; you will be paid your regular salary. Upon completion of jury duty, present a Verification of Attendance Form to the church.

If the court dismisses the jury early, return to work as soon as possible and complete a regular workday consisting of civic time and time on the job. If the employee''s work duties are vital to church operations, the church and employee may request the court to excuse the employee from jury duty or delay its commencement.

## Bereavement Pay

In the event of a death in an employee''s immediate family, the employee is allowed paid time off to assist with arrangements or attend the funeral, according to the following schedule:

- **Spouse/child/step-child**: 15 days
- **Parent/step-parent**: 5 days
- **Brother/step-brother/sister/step-sister**: 5 days
- **Grandparent**: 3 days
- **Grandchild**: 3 days
- **Mother/father-in-law**: 2 days
- **Son/daughter-in-law**: 2 days
- **Brother/sister-in-law**: 2 days

If additional time is necessary, employees may request earned vacation time or a personal leave of absence (subject to the leave of absence policy) — sick leave may not be used for this purpose, and the employee''s oversight and a senior staff member must approve the additional time.

Employees must notify their immediate oversight as soon as possible; the oversight notifies the church of the time off. If proper notification isn''t given, the staff member may not be paid for the funeral leave. Payment is not made under this policy when a death occurs during an employee''s vacation, leave of absence, layoff, or a time when the employee receives holiday pay. The church may request substantiation of the death and/or confirmation of the employee''s attendance at the funeral.

## Military Leave

It is church policy to grant a leave of absence without pay to staff members who participate in U.S. Armed Forces Reserve or National Guard training programs, in accordance with the provisions of the Universal Military Training and Service Act.', 8
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-jury-bereavement-military-leave');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-childcare-health-insurance-benefits', 'Childcare, Health Insurance & Other Benefits', 'Childcare expectations during work hours, health insurance eligibility, annual bonus, Social Security, workers'' compensation, and educational assistance.', '## Childcare

The church does not provide childcare for employees during regular work hours. Employees should refrain from bringing children to work unless arrangements have been discussed in advance with their immediate oversight.

When childcare is offered for an event or Sunday service, employees are welcome to check their children into TC Kids. If an employee''s required call time begins before TC Kids check-in, they are responsible for making appropriate childcare arrangements based on the needs of their role.

On Sundays, employees may attend a service with their family and children when their role and responsibilities allow. Employees whose roles may require them to step out, respond to an issue, or remain available during service should have an appropriate childcare plan in place. Because responsibilities vary by position, childcare expectations may differ based on the requirements, schedule, and responsibilities of each employee''s role.

## Health Insurance

The church offers individual health insurance policies for full-time employees who work **30 hours or more** per workweek, at the completion of the 90-day introductory employment period. Each employee has an allotted dollar amount based on their individual employment agreement. The plan covers the employee only, but can be set up to cover spouse and family if desired. Transform Church will pass along any increases in health insurance costs to employees, deducted from the employee''s weekly payroll when the increase takes effect (see employment agreement).

Employee benefit information in this handbook is not a contract to provide these benefits — benefits will be listed in the employee agreement. Exempt staff members are eligible for benefits if they meet specific requirements. The terms of benefit plans are subject to change at any time by the insurer(s) or the church, and the current health insurance provider may change from time to time.

## Annual Bonus

Each eligible employee who meets the applicable standards will be eligible for a bonus. Bonuses are based on the financial condition of the church and must be approved.

## Social Security

Social Security provides benefits for employees and their families in the event of retirement, hospitalization after age 65 (Medicare), total and permanent disability before age 65, and death at any time. The church is required by federal law to withhold the employee''s share of Social Security taxes and matches the amount paid by each employee. Contact the local Social Security office for details.

## Workers'' Compensation

All employees are automatically covered by Workers'' Compensation Insurance at the time of hire; eligibility for benefits is effective on the date of hire. Any employee who suffers an accident on the job must notify an oversight immediately or **within twenty-four (24) hours**, regardless of how minor — delay may result in loss of eligibility. Reporting must be filed by an employee within 24 hours of the onset of illness or injury. Benefits provide weekly payments based on a statutory specified amount of the employee''s regular earnings, plus payments for medical and hospital expenses. Lost time due to an occupational illness or injury covered by Workers'' Compensation is credited as active service for all church benefits. The church complies with all state and federal laws regarding Workers'' Occupational Diseases and Workers'' Compensation.

## Educational Assistance and Professional Memberships

Where it can be demonstrated that the church will benefit from an employee''s participation in an educational program or professional organization, the related expenses may be paid by the church. The Senior Pastor and Transform Church Board must approve requests for payment of these expenses **in advance**.', 9
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-childcare-health-insurance-benefits');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-performance-evaluations-job-descriptions', 'Performance Evaluations, Job Descriptions & Introductory Period', 'How often staff performance reviews happen by tenure, what a job description is for, and how the 90-day introductory period works.', '## Performance Evaluations

The church conducts performance reviews to allow your oversight to discuss your overall performance, review your strengths, and suggest methods of improvement. Frequency of reviews:

- **First 90 Days**: reviews at 30, 60, and 90 days
- **Year 1**: once-a-quarter reviews
- **Year 2+**: 2 reviews annually
- **Senior Staff**: 1 review annually plus a 360 Review Form

## Job Descriptions

A job description summarizes your duties and responsibilities and gives you important information about your role. Read and study your job description carefully and discuss it with your oversight if you have questions. The church reserves the right to revise and update your job description as it deems necessary and appropriate.

## Introductory Period

All new employees must go through a **90-day introductory period**. During this period, and at all times thereafter, all employees serve on an "at will" employment basis. The introductory period is a trial period in which the employee and employer can evaluate the job relationship, including an evaluation of performance. It can be extended to a maximum of **six (6) months**.', 10
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-performance-evaluations-job-descriptions');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-harassment-ethics-policy', 'Harassment & Ethics Policy', 'Transform Church''s anti-harassment policy, examples of sexual harassment, how to report it, and the church''s general ethics expectations.', '## Harassment

The church will not tolerate harassment of any kind and is committed to providing a work environment free of discrimination. The church maintains a strict policy prohibiting unlawful harassment, including sexual harassment. Jokes, stories, cartoons, nicknames, and comments about appearance may be offensive to others.

Sexual harassment of employees by oversights, co-workers, or vendors is prohibited. Examples include unwelcome sexual flirtations, advances, or propositions; verbal abuse of a sexual nature; subtle pressure or requests for sexual activities; unnecessary touching; graphic comments about an individual''s body; a display of sexually suggestive objects or pictures; sexually explicit or offensive jokes; or physical assault — also when:

- submission to the conduct is made a condition of employment;
- submission to or rejection of the conduct is used as the basis for an employment decision affecting the harassed employee; or
- the harassment has the purpose or effect of unreasonably interfering with an employee''s work performance or creates an intimidating, hostile, or offensive work environment.

If you believe you are being, or have been, harassed in any way, report the incident(s) to the HR representative within a reasonable time, without fear of reprisal. The totality of the circumstances will be investigated by an appropriate party chosen by the Senior Staff. Violation of this policy may result in disciplinary action, up to and including possible termination.

This policy covers not only sexual harassment but also harassment relating to individual race, color, national origin, age, or physical or mental handicap/disability.

## Ethics Policy

The church expects employees to conduct themselves personally and professionally according to the highest ethical and moral standards of conduct.', 11
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-harassment-ethics-policy');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-performance-standards-conduct', 'Performance Standards & Standards of Conduct', 'Examples of poor job performance and misconduct that can lead to discipline, plus the church''s dating policy for minors.', '## Performance Standards

It is the policy of the church to expect all employees to abide by certain work rules of general conduct and performance at all times. Accordingly, a violation of these regulations constitutes misconduct, and disciplinary action will be initiated. These rules are guidelines only and are not all-inclusive. Disciplinary action may include, but is not limited to, verbal reprimand, written notice, suspension from work without pay, and immediate termination. Benefits will not accrue nor be recoverable during a disciplinary suspension period.

### Examples of Poor Job Performance

- Below average work quality or quantity.
- Poor attitude, including rudeness or lack of cooperation.
- Excessive absenteeism, tardiness, or abuse of break and meal privileges.
- Failure to follow instructions or church policies and procedures.

### Examples of Misconduct

This is not a complete list of circumstances for which discipline will be warranted:

- Falsification of any records or reports pertaining to absence from work, claims provided by the church, communications, or records including personnel records.
- Disclosing confidential information to outsiders or unauthorized employees.
- Unethical conduct or serious conflicts of interest.
- Reporting to work under the influence of alcohol or illegal drugs; possession, sale, or use of marijuana or illegal drugs or chemicals, or consumption of alcohol while working at the office.
- Stealing, hiding, concealing, or misappropriating church property or the property of others.
- Gross negligence or willful acts resulting in damage to church property or injury to others.
- Gross insubordination — a willful and deliberate refusal to follow reasonable orders by a member of church leadership.
- Willfully misusing church property or equipment.
- Violation of equal opportunity or sexual harassment policies.
- Serious safety violation resulting in injury.
- Not following a reasonable order or failing to perform assigned work or comply with work and safety rules.
- Gaining unauthorized access to, viewing, or using church records.
- Use of threatening, profane, or abusive language.
- Demonstration of lack of courtesy to others.
- Not completing assignments up to the quality required by the church.
- Failure to report personal injury resulting from a job work situation.
- Divulging personal salary, bonuses, or other compensation.
- Making comments or remarks disparaging to the church or its officers to outsiders.
- Engaging in "grapevine" gossip, untruths, or speculations to the detriment of the church or the morale of its members.

## Dating Policies

No pastoral staff or staff in leadership is permitted to date a minor. All staff are expected to exhibit Christian boundaries while dating.', 12
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-performance-standards-conduct');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-confidentiality-safety-substance-policy', 'Confidentiality, Safety & Substance Use Policy', 'Rules on confidentiality of church information, safety, and the drug- and alcohol-free workplace policy, plus building security expectations.', '## Confidentiality

The church requires that a strict code of confidentiality of information be maintained. Employees are prohibited from storing or divulging information outside the church (in written or electronic form) about any matter of church business. No Transform Church-created materials may be sold or distributed without the written consent of senior staff. Any employee who compromises information may be subject to termination of employment and legal action provided by law for damage restitution. Your signature on the receipt of the employee handbook signifies that you agree to keep our confidentiality policy during and after your employment at Transform Church.

## Safety and Accidents

Transform Church strives to provide safe working conditions for all employees. No one will knowingly be required to work in any unsafe manner. Safety is every employee''s responsibility — notify your oversight with any concerns of potentially dangerous conditions.

## Alcohol, Drugs, and Controlled Substances

Smoking and being under the influence of alcohol or drugs is considered an offense that can lead to termination. The use, possession, sale, transfer, purchase, or being under the influence of alcohol, illegal drugs, or other intoxicants by employees at any time on church premises, when on duty, or in church vehicles is prohibited.

"Under the influence" is defined as being unable to perform work in a safe or productive manner, and/or being in a physical or mental condition that creates a risk to the safety and well-being of the affected employee, other co-workers, the public, or church property. Violation of this policy may result in disciplinary action, up to and including termination.

## Security

All doors, files, desks, and other equipment with locks must be kept locked securely when not in direct use and at the end of each day. Locks should be checked regularly, and lost keys must be reported to your oversight immediately. Any concerns about security should be directed to the Pastors. Transform Church will not be responsible for personal property that is lost, damaged, stolen, or destroyed.', 13
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-confidentiality-safety-substance-policy');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-outside-employment-financial-policies', 'Outside Employment, Phone Use & Financial Policies', 'Rules on outside employment, phone and postage use, conflicts of interest, loans, and expense report requirements.', '## Outside Employment

When an employee is on the job, 100% of their effort is required. If an employee''s outside employment competes with what is expected of them as a church employee, opportunities for promotion and advancement may be limited. If there is a demonstrated need for outside employment, discuss the situation with your oversight immediately. No use of Transform Church property, including staff computers, is permitted for outside employment.

## Using the Telephone

Each time an employee makes or receives a telephone call, they represent the church. The church has a limited number of telephone lines, and it is essential that those lines remain open for church business calls. Frequent personal phone conversations are unacceptable.

## Postage

Unauthorized usage will be treated as theft with appropriate disciplinary action.

## Conflicts of Interest

Employees shall avoid outside employment, activities, investments, and other interests that involve obligations that may compete with or conflict with the interests of Transform Church. A conflict of interest can arise in dealing with anyone the church transacts business with: members, owners, suppliers, banks, insurance companies, and people in other organizations with whom we contract and make agreements. Conflicts of interest should be avoided and may include:

1. Working for any of the above-mentioned groups for personal gain.
2. Engaging in part-time activity for profit or gain in any field in which the church is engaged.
3. Borrowing from or lending money to individuals representing organizations with whom business dealings are conducted.

## Loans

No employee shall receive any loan valued in excess of **$100** from any outside source (including church members), with the exception of official bank loans, without approval from the Board. Any employee who fails to abide by this policy will be subject to disciplinary action.

## Expense Reports

An expense report form must be properly completed and submitted in order to be reimbursed for any purchase made. Documentation for all expenses is required. Any item not accompanied by a receipt, or an expense that is not an approved/budgeted item, will not be approved.', 14
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-outside-employment-financial-policies');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-computer-use-policy', 'Computer Use Policy', 'Transform Church''s computer use policy covering privacy expectations, prohibited activities, password and file security, and virus and encryption software rules.', 'Transform Church relies on its computers and computer network to conduct its business. To ensure employees, independent contractors, agents, and other computer users use its computer resources properly, Transform Church has adopted this Computer Use Policy. The rules described apply to all users of Transform Church computers and computer networks, wherever located. Violations will be taken very seriously and may result in disciplinary action, including possible termination, and civil and criminal liability. The computer resources are property of Transform Church and may be used only for legitimate business purposes; use of the computer system is a privilege that may be revoked at any time.

## No Expectation of Privacy

Users should not have an expectation of privacy in anything they create, store, send, or receive on the computer system — it belongs to Transform Church and may be used for business purposes. Users expressly waive any right of privacy in anything they create, store, send, or receive on the computer or through the Internet or any other computer network, and consent to allowing authorized personnel of Transform Church to access and review all such materials. Transform Church may use human or automated means to monitor use of its computer resources.

## Prohibited Activities

- **Inappropriate or unlawful material**: fraudulent, harassing, embarrassing, sexually explicit, profane, obscene, intimidating, defamatory, threatening, abusive, or otherwise unlawful or inappropriate material may not be sent by email or other electronic communication, or displayed or stored on computers. Report any such material encountered to your oversight.
- **Prohibited uses**: without prior written permission from the Pastors, computer resources may not be used for dissemination or storage of commercial or personal advertisements, solicitations, promotions, destructive programs (viruses or self-replicating code), political material, or any other unauthorized use.
- **Waste of computer resources**: users may not deliberately waste resources or unfairly monopolize them, including sending mass mailings or chain letters, spending excessive time on the internet, playing games, engaging in online chat groups, printing multiple copies of documents, or otherwise creating unnecessary network traffic.
- **Misuse of software**: without prior written authorization from the Pastors, users may not copy software for home computers; provide copies to independent contractors, members, or third parties; install software on any workstation or server; download software from the internet or other online services to church workstations or servers; modify, revise, transform, recast, or adapt any software; or reverse-engineer, disassemble, or decompile any software. Report any misuse of software or copyright violation to your oversight immediately.

## Passwords

Users are responsible for safeguarding their passwords for access to the computer system. Individual passwords should not be printed, stored online, or given to others. Users are responsible for all transactions made using their passwords. No user may access the computer system with another user''s password or account.

## Security

Users may not alter or copy a file belonging to another user without first obtaining permission from the file''s owner — the ability to read, alter, or copy a file does not imply permission to do so. Users may not use the computer system to "snoop" or pry into the affairs of other users by unnecessarily reviewing their files and email. A user''s ability to connect to other computer systems through the network or a modem does not imply a right to connect to or make use of those systems unless specifically authorized. Each user is responsible for ensuring that use of outside computers and networks, such as the internet, does not compromise the security of Transform Church''s computer resources, including taking reasonable precautions to prevent unauthorized access and the spread of viruses.

## Viruses

Each user is responsible for taking reasonable precautions to ensure they do not introduce viruses into Transform Church''s network. All material received on a USB or other magnetic or optical medium, and all material downloaded from the internet or from computers or networks that do not belong to Transform Church, must be scanned for viruses and other destructive programs before being placed onto the computer system. Home computers and laptops may contain viruses, and all disks transferred from these to Transform Church''s network must be scanned for viruses.

## Encryption Software

Users may not install or use encryption software on any of Transform Church''s computer resources without first obtaining written permission from their oversight, and may not use passwords or encryption keys that are unknown to their oversights. The federal government has imposed restrictions on the export of programs or files containing encryption technology — software containing encryption technology is not to be placed on the internet or transmitted outside the U.S. without prior written authorization from the Pastors.', 15
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-computer-use-policy');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'handbook-statement-of-faith', 'Statement of Faith', 'Transform Church''s thirteen-point Statement of Faith, included as part of the Employee Handbook.', '## We Believe These Things

1. We believe in ONE GOD, expressed in 3 persons: Father, Son, and Holy Spirit (Ephesians 4:4-6).
2. We believe that God made the heavens and the earth in 6 days and that He rested on the seventh (Genesis 1).
3. We believe that God made man in His own image, but because of the fall that image is tarnished and mankind is separate from God (Romans 3:11-12).
4. We believe that God so loved us that He gave His one and only Son, born of the virgin Mary, who lived a sinless life, healed the sick, raised the dead, and claimed to be the Messiah. He then died a sacrificial death for our sins, rose from the dead 3 days later, defeating sin, death, and hell, that those who trust in Him shall inherit eternal life (John 3:16).
5. We believe in the inerrancy of Scripture (2 Timothy 3:16-17).
6. We believe that the message of Jesus is a message of grace and truth, and through Him alone will you find forgiveness, purpose, and true meaning in life (John 10:10, John 1:14).
7. We believe that each believer is indwelt by the Holy Spirit, and should seek to have a relationship with God, and seek to find their purpose in life (2 Corinthians 5:17, 1 Corinthians 1:11, Matthew 7:7).
8. We believe in all the gifts of the Spirit, the Baptism of the Spirit, and that God wants to work powerfully today through faith-filled people to accomplish His will on the earth (James 5:16, Mark 16:15).
9. We believe in the second coming of Christ, where God will rapture His church, and they will spend forever in heaven with Him (1 Thessalonians 4:14).
10. We believe that people''s response to the message of Christ will determine forever their destiny in heaven or hell (John 14:6).
11. We believe in living a life on fire for God — a passionate, joyful, abundant, overcoming life that influences many others around you for the glory of God (John 10:10, Philippians 4:4, 2 Corinthians 2:15, Romans 15:13).
12. We believe that the message of Jesus and the principles of the Word give life and hope to people even in hopeless situations — that dreams can come true, and that our generation and the generation after us will be blessed because we were committed to Christ (Isaiah 61:1-7).
13. We believe in loving God, loving people, and loving life! (Matthew 22:34-40, 1 Peter 3:1)', 16
FROM "wiki_categories" c
WHERE c."slug" = 'employee-handbook'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'handbook-statement-of-faith');
--> statement-breakpoint
INSERT INTO "wiki_categories" ("slug", "name", "description", "sort_order")
VALUES ('workplace-policies', 'Workplace Policies & Guidelines', 'Day-to-day office, building, and operational policies covering the workspace, meetings, kitchen, parking, mail, rooms, contracts, and communication tools.', 2)
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'staff-office-policy-hours-workspace-building', 'Staff Office Policy: Hours, Workspace & Building Access', 'Office hours, visitor rules, desk and workspace standards, mail handling, and building lock-up protocol.', 'Last updated: 12/02/25

## Office Hours

Office hours are **8:30am - 4:30pm Mon-Fri**, and an hour before service on Sundays for those who do not serve with a team. Team members are expected to be at their desk location, actively working and settled by that time — not arriving, settling in, or starting personal routines. If you need time to make coffee, have breakfast, catch up with others, or get situated, arrive earlier so you''re fully ready to begin your work day when it starts. If you will be tardy, message your oversight, who will relay to HR.

## Office Visitors & Meetings

Anyone who is not Transform Church Staff should not be in the office for an extended duration without a Transform Church Staff member. Printing something or dropping something off is fine, but non-staff working or hanging out in the office for extended periods is not permitted. This does not apply to an intern or someone working closely with you routinely in a volunteer capacity.

Since the office is a shared collaborative space, it is not considered a meeting space. Quick, brief staff-to-staff check-ins are fine (as long as not distracting), but meetings that prevent someone else from working there should be avoided.

## Your Workspace

Desks should remain clutter-free, organized, and aesthetically pleasing:
- No boxes, bags, or supplies left on the floor around or under desks (bring them to the trash room located on track).
- Minimal items or materials on your desktop — keep it tidy and focused.
- Desks should be reset at the end of each day — clear of loose papers, extra items, and anything that doesn''t belong.
- No trash or leftover food should be left behind — all garbage must be thrown away daily.
- Shelves and surrounding areas should be kept organized and visually neat, with items stored intentionally.

Any major change to an aesthetic part of your desk (chair, monitor, etc.) needs approval from Transform Church oversight.

## Mail

Only mail with someone''s name on it is to be put on their desk — mail for a team a person oversees, or any other mail, should be placed in the mailroom.

## Building Lock-Up Protocol

The building will be unlocked at the start of the workday and locked at the end of the day by the Building Team. If you are working past 4:30pm and your area requires you to lock up, take responsibility to do so — before locking up, check with other staff members to ensure no one else is still working in the building.', 0
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'staff-office-policy-hours-workspace-building');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'staff-office-policy-communication-meetings-dress', 'Staff Office Policy: Communication, Meetings & Dress Code', 'Office interaction etiquette, dress code, meeting preparation guidelines, email response standards, and Tuesday staff-day expectations.', '## Office Interaction Guidelines

- **Headphones Signal Focus** — when a team member is wearing headphones, it''s a signal they are focused and should not be interrupted. If you need to connect urgently, walk over to politely check if they''re using headphones for background noise or for focus.
- **Communicate Face-to-Face** — walk over to someone''s desk and speak with them directly instead of calling to them from desk to desk.
- **Be Mindful with Phone Calls** — keep phone calls in the office space short and purposeful; if a call becomes longer or more personal, step outside or to a designated area.
- **Use Headphones for Audio** — any audio from your computer, including music, videos, or other media, should be listened to using headphones to minimize distractions to others.

### Dress Code

Dress the part — this is a professional office environment and a reflection of Transform Church. At any moment, visitors, leaders, or guests may walk through our doors. Tuesdays are our all-staff day, so we avoid more casual-looking wear that day.
- Modesty
- Dress like a leader leading in this generation
- Be neat (hair, make-up, ironed clothes, no dirty sneakers)
- No shorts; while trendy sets and joggers are fine, traditional gym or lounge sweatpants aren''t considered office-appropriate

Certain events, projects, or ministry functions may require athletic or workwear attire — when that is the case, staff should dress in a manner that best supports the work being done, and it should be project/event specific.

## Meeting Scheduling & Preparation Guidelines

To honor everyone''s time and make meetings more productive:
- **Include Transition Time** — when scheduling meetings, consider time needed for people to wrap up and move between meetings.
- **Start with a Hard Stop** — confirm the hard stop time at the start of the meeting. Unless stated otherwise, assume the calendar end time is the hard stop.
- **Communicate Availability** — if you can''t stay for the full meeting, let the organizer know in advance.
- **Be On Time and Prepared** — arrive on time, ready to contribute at the meeting start time; if setup is required, arrive early.
- **Send an Agenda in Advance** — share a clear agenda before the meeting, linked directly in the calendar invite.
- **Book a Room and Add Purpose** — reserve a meeting room in the calendar invite and include a short description of the meeting''s purpose or goal.

## Emails

- **Clear Out Your Inbox Regularly** — make every effort to clear your inbox by the end of each workday. Our standard is to respond within **48 working hours**. Acknowledge even if you don''t have the answer yet — a response can be as simple as "Got this, I''ll get back to you by [date/time]."
- **Emails Are Your Responsibility** — it is your responsibility to track, follow up, and close the loop on emails. Have a system in place that works for you to ensure nothing slips through the cracks.

## Tuesdays

Tuesdays are designated Staff Days at Transform Church — high-priority, in-office days to be treated with intentionality and professionalism:
- **Dress the part** — this is not a casual day.
- **Avoid scheduling PTO or appointments** — unless absolutely necessary and unavoidable, refrain from requesting time off, working remotely, or scheduling doctor''s visits or other personal commitments on Tuesdays when appropriate.
- **Be fully present** — your attendance, engagement, and availability are valued in our staff culture and weekly rhythm.

### Staff Meetings

Staff meetings are high priority. Come prepared with wins for your area, stories, and anything going well to share with the staff.', 1
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'staff-office-policy-communication-meetings-dress');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'staff-office-policy-daily-rhythms-resources', 'Staff Office Policy: Daily Rhythms & Resources', 'How the staff kitchen, room booking, lunch breaks, remote work approval, office supplies, and Sunday seating work day to day.', '## Staff Kitchen

- The staff kitchen is a communal space — you are welcome to any food and drinks in the fridge. Anything you do not want shared should have your name on it, or be in a clearly identified lunch bag.
- If the trash is full and you have the time, please empty it in the track and refill the bag.
- Use the kitchen request form for anything out of stock, or any special snacks you''d like — the staff kitchen is restocked every Monday.
- Review the staff kitchen guidelines.

## Room Booking

You will be given access to the room booking calendar — please book a room whenever you''re using one, and follow the room booking guidelines.

## Lunch Break

All staff are able to take a one-hour, paid lunch break. They do not need to notify their oversight when taking their lunch break, unless their oversight has expected them to be in a specific location at that time. If someone is in a support role such as an assistant, they need to notify the person they assist of their break timing.

## Remote Work

- Remote work must be approved by your direct oversight — each role differs in its flexibility for remote work. If remote work is within the scope of your role, approval must be given each time, unless stated otherwise. This includes working from home, a coffee shop, or any offsite location.
- A one-time approval does not apply to future dates — approval is required for every instance.
- While working remotely, you are expected to be just as accessible as in the office — including responding promptly to calls, texts, emails, and attending meetings.
- Remote work should be done from a location that allows you to come into the office if needed on short notice.

## Resources/Staff Supplies

- Supplies in the staff office closet are for everyone on staff — no prior approval needed.
- There is a resources budget and an office supply budget, both overseen by the Finance and Business Manager, requiring prior approval to purchase.
- If you need equipment for your desk beyond what is provided, submit an email request to the Finance and Business Manager.
- If you want to purchase a resource to grow yourself related to work (e.g. a book) for you or someone you oversee, submit an email request to the Finance and Business Manager.

## Sundays

- On Sundays, staff are expected to sit for one service.
- We sit in the front row and stay engaged as active participants in the service — avoid side conversations or being on your phone for extended periods. Use good judgment to balance your responsibilities while remaining present and respectful.
- We use the seating chart to label which service.

## Events

Any paid event a staff person works, they do not need to purchase a ticket — registration is processed on the back end for them.', 2
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'staff-office-policy-daily-rhythms-resources');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'conflict-of-interest-policy', 'Conflict of Interest Policy', 'Transform Church''s policy on avoiding and disclosing conflicts of interest for Trustees, officers, and management employees.', '## Reason for Statement

As a ministry initiated and sustained by God, the organization has a mandate to conduct all of its affairs decently and above reproach both in the sight of God and man. That accountability includes a commitment to operate with the highest level of integrity and to avoid conflicts of interest.

As a nonprofit, tax-exempt entity, the organization depends on charitable contributions from the public. Maintenance of its tax-exempt status is important both for its continued financial stability and for the receipt of contributions and public support. The IRS and state corporate and tax officials view the operations of the organization as a public trust, accountable to both governmental authorities and members of the public.

Among the organization and its Board, officers, and management employees, there exists a fiduciary duty, carrying a broad and unbending duty of loyalty. The Board, officers, and management employees are responsible for administering the organization''s affairs honestly and prudently, and for exercising their best care, skill, and judgment for the sole benefit of the organization. Those persons shall exercise the utmost good faith in all transactions and shall not use their positions or knowledge gained for personal benefit. The organization''s interests must have first priority, and all purchases of goods and services must secure full competitive advantages as to product, service, and price.

## Persons Concerned

This statement is directed to Trustees and officers, as well as employees annually designated by the Board who influence the actions of the organization or its Board, or make commitments on its behalf — including all who make purchasing decisions, "management personnel," and all who have proprietary information concerning the organization.

## Areas in Which Conflicts May Arise

Conflicts of interest may arise in the relations of Trustees, officers, and management employees with any of the following third parties:
1. Persons or entities supplying goods and services to the organization.
2. Persons or entities from which the organization leases property and equipment.
3. Persons or entities dealing or planning to deal with the organization on the gift, purchase, or sale of real estate, securities, or other property.
4. Persons or entities paying honoraria or royalties for products or services delivered by the organization, its agents, or employees.
5. Other ministries or nonprofit organizations.
6. Donors and others supporting the organization.
7. Stations or programmers that carry the organization''s programming.
8. Agencies, organizations, and associations that affect the operations of the organization.

## Nature of Conflicting Interest

A material conflicting interest is a direct or indirect interest between any person or entity mentioned above and a Trustee, officer, or management employee, which might affect — or might reasonably be thought by others to affect — the judgment or conduct of that person. Such an interest might arise through:
1. Owning stock or holding debt or other proprietary interests in any third party dealing with the organization.
2. Holding office, serving on the Board, participating in management, or being otherwise employed (or formerly employed) in any third party dealing with the organization.
3. Receiving remuneration for services with respect to individual transactions involving the organization.
4. Using the organization''s personnel, equipment, supplies, or goodwill for other than organization-approved activities, programs, and purposes.
5. Receiving personal gifts or loans from third parties dealing with the organization. (Receipt of any gift is disapproved except gifts of nominal value that could not be refused without discourtesy. No personal gift of money should ever be accepted.)
6. Obtaining an interest in real estate, securities, or other property that the organization might consider buying or leasing.
7. Expending staff time during normal business hours for personal affairs or for other organizations, civic or otherwise, to the detriment of work performance.

## Indirect Interests

A Trustee, officer, or management employee will be considered to have an indirect interest in another entity or transaction if any of the following also have an interest:
1. A family member (defined as all persons related by blood or marriage).
2. An estate or trust of which the person or a family member is a beneficiary, personal representative, or trustee.
3. A company of which a family member is an officer, director, or employee, or in which they have ownership or other proprietary interests.

## Interpretation of This Statement of Policy

The areas and relations listed above are not exhaustive — conflicts might arise in other areas or through other relations, and it is assumed that Trustees, officers, and management employees will recognize such areas by analogy.

The existence of one of the described interests does not necessarily mean a conflict exists, or that it is material or adverse to the organization''s interests. However, it is Board policy that the existence of any such interest shall be disclosed **before any transaction is consummated**. It is the continuing responsibility of Trustees, officers, and management employees to scrutinize their transactions with outside business interests and relationships for potential conflicts and to immediately make such disclosures.

Disclosure should be made to the President (or, if the President has the conflict, to the Chairman of the Board), who brings the matter to the attention of the Board. The Board determines whether a conflict exists and is material, and — in the presence of an existing material conflict — whether the contemplated transaction may be authorized as just, fair, and reasonable to the organization. These decisions are at the sole discretion of the Board, whose first concern must be the welfare of the organization and the advancement of its purposes.', 3
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'conflict-of-interest-policy');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'contract-waiver-guidelines', 'Contract & Waiver Guidelines', 'Who can sign contracts, the Monday.com approval workflow and timeline, deposit process, and how event waivers are drafted and approved.', '## Contract Guidelines

1. All contracts are only to be signed by the Executive Pastor, Finance and Business Manager, Board Treasurer, or Operations Director. This authority may be delegated by one of them to a specific staff member.
2. Contract name should be written to **Church Alive.TV, d/b/a Transform Church**.
3. **Steps**:
   - Upload the contract to the board on Monday.com with a deadline.
     - Tag the Operations Director and give a deadline.
     - Operations Director approves and addresses all concerns, then tags the Finance and Business Manager with a deadline.
     - Finance and Business Manager approves and emails the Board Treasurer that it is on Monday.com for approval, with a deadline.
     - When the Board Treasurer approves, the Finance and Business Manager tags the Events Director to move forward.
4. **Timeline to get a contract signed: 9 business days total** — Operations Director (3 business days), Finance and Business Manager (3 business days), Board Treasurer (3 business days).

## Deposit Guidelines

1. The person responsible for the contract should email the Finance and Business Manager with:
   - Contract name
   - Contract event date
   - Contract payment schedule (dates and numbers)
2. The Finance team needs **7 business days** to confirm whether we can agree to those terms.

## Waiver Guidelines

1. When a waiver is requested, it must be:
   - Drafted by the Finance and Business Manager
   - Talked through with our insurance company
   - Approved by the Finance and Business Manager and Board Treasurer
2. This process could take as little as **2 weeks** or as long as a few months, depending on complexity — connect with the team as soon as possible.', 4
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'contract-waiver-guidelines');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'hotel-booking-policy', 'Hotel Booking Policy', 'The approval steps for booking a Marriott hotel versus another hotel for travel or events.', '## If Marriott Hotel

1. Admin team asks whether Ashley will be choosing the hotel (Ashley chooses if it''s an event, e.g. RW or 252).
2. Admin team sends Ash and H the hotel name, link, and distance from event/spot, reads reviews, and sends any red flags (culturally look for poor customer service or cleanliness issues like bed bugs, roaches, etc.).
3. H and Ash approve.
4. Book.

## If Not Marriott Hotel

1. Admin team asks whether Ashley will be choosing the hotel.
2. Admin team identifies 3 options and sends to H with hotel name, link, distance from event/spot, reviews, and any red flags (culturally look for poor customer service or cleanliness issues like bed bugs, roaches, etc.).
3. H approves options from a liability standpoint.
4. Admin team sends to Ash.
5. Book.', 5
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'hotel-booking-policy');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'kings-court-parking-policy', 'Kings Court Parking Policy', 'Rules for authorized staff parking, exceptions for church activities, overnight parking approval, and unauthorized vehicles at Kings Court.', '## Authorized Parking

- **Kings Court parking** is reserved for authorized staff members only. All staff vehicles parked in Kings Court must display a valid staff parking badge at all times during work hours. Staff parking tags are assigned to the individual staff member and may not be shared, transferred, or given to another person for use.
- **Exceptions** may be granted for extended periods related to approved church activities, such as mission trips, conferences, retreats, or other ministry-related events. In these cases, the Facilities Director will coordinate with the Property Manager and provide specific parking instructions, including the designated location where the vehicle must be parked.
- **Approval for overnight parking** — staff members who receive approval for an exception are expected to follow the parking instructions provided by the Facilities Director, based on the Property Manager''s requirements.

## Overnight Parking

Overnight parking is not permitted unless prior approval has been granted by the Facilities Director. If a staff member needs to leave their vehicle overnight for any reason, they must notify the Facilities Director as soon as possible and receive approval before leaving the vehicle on the property whenever possible.

## Unauthorized Vehicles

Vehicles that do not display a valid staff parking badge or have not received approval for overnight parking may be considered unauthorized and may be subject to removal at the owner''s expense, in accordance with property management.', 6
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'kings-court-parking-policy');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'mail-room-guidelines', 'Mail Room Guidelines', 'Delivery hours, package pickup and storage windows, disposal rules, and who to contact about missing or damaged deliveries.', 'The mailroom is for church and ministry-related deliveries only — personal packages are not permitted.

## Packages & Deliveries

- All packages will be received and stored in the designated team-specific area in the old kitchen.
- When ordering, include your name and team/department. Example: "Transform Church: John Smith – Event Team."
- Delivery hours: **Monday–Thursday, 8:30am–4:30pm**; **Sunday, 8:00am–1:00pm**.
- Packages delivered outside of these hours may be returned to the sender, or dropped off at the gym or hair salon (you may check these locations directly).

## Pickup & Storage

- Packages must be picked up within **one week** of delivery.
- A reminder email will be sent if a package is not picked up after one week.
- Mailroom shelves will be cleared **biweekly** — if you are unable to pick up your item within that timeframe, notify Facilities in advance.

## Large or Bulk Deliveries

- For large or bulk items, the ordering team is responsible for bringing it upstairs and putting it away.
- These items can be stored at the bottom of the stairs in the front entrance temporarily.
- Storage for large or bulk items is limited to a maximum of **two weeks**.

## Disposal & Cleanliness

- After opening packages, all empty boxes must be broken down and disposed of in the green waste bin located at the back of the track.
- Please do not leave boxes or packing materials in the mailroom.

## Delivery Issues & Support

If a package is missing, damaged, or incorrectly delivered, email **Facilities@churchalive.tv**. Please allow up to **48 hours** for a response.', 7
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'mail-room-guidelines');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'room-booking-guidelines', 'Room Booking Guidelines', 'Room access levels, how to book during and after work hours, sanctuary requirements, setup/breakdown expectations, AV use, and decoration restrictions.', 'These guidelines help us steward our building with excellence, honor one another''s time, and support every ministry effectively. If you have questions, contact **facilities@transformchurch.com**.

## Room Directory & Access Levels

- **Thrive** — everyone. Resources: chairs, TV.
- **Foyer** — everyone. Resources: folding chairs, 6ft tables.
- **Sanctuary** — upon request only, requires 100+ people and approval from Ps. Magno. Must return to Sunday setup — no décor, no chair setup.
- **Overflow** — everyone. Resources: chairs, TV.
- **Conference Room** — everyone. Resources: chairs, TV.
- **TC Kids Space** — everyone; no food without approval. Resources: folding chairs, tables.
- **Multi-Purpose Room (Mother''s Room)** — upon request. Resources: 2 couches, TV, chairs.
- **Track Area** — everyone. Resources: chairs.
- **Ps. Anthony''s Office** — upon request, requires approval from Facilities.
- **Ps. Katie''s Office** — upon request, requires approval from Facilities.
- **Staff Offices (downstairs)** — off limits unless pre-approved by oversight.
- **Upstairs Creative Office** — off limits unless pre-approved by oversight.

## Booking Options & When to Use Them

**A. During Work Hours (8:30am–4:30pm)**

Staff may add room reservations directly to the TC Room Booking Google Calendar. Check the calendar monthly to delete any recurring meetings that are no longer relevant.
- Calendar entry format: "Room - Team Name or Staff Name" (e.g. "Thrive - First Impressions" or "Thrive - Staff name").
- Staff bookings take priority over any other booking. If two staff members need the same room, Facilities may help resolve the conflict, but resolving it yourselves first is encouraged.
- If a room is booked properly ahead of time, that booking holds priority.

**B. After Hours**

All after-hours bookings (staff or Transform Groups) require a **Room Booking Request Form** to track who is in the building, ensure closing/lock-up responsibility, and allow Facilities to support appropriately.

**48-Hour Rule**: Facilities responds within 48 hours. If there''s no response and the room is open, staff may add it to the calendar on their own.

## Sanctuary Booking Policy

- Minimum of 100 attendees.
- Decor must be submitted for approval.
- No food.
- Production equipment use requires a special Production request.
- Sanctuary setup must be returned to Sunday format exactly.

## Setup & Breakdown Expectations

Teams are responsible for:
- Setting up their own room.
- Putting all furniture back exactly where it was.
- Throwing away trash in the dumpster if food was served or bins are full. If spills or damage occur, notify Facilities right away via a Facilities Damage Report. Please take all leftover food with you — if placing it in the staff or old kitchen fridge, already have it assigned to who will eat it.
- Wiping tables (especially if food was present).
- Keeping hallways and exits clear.
- Resetting any resources they moved.
- No overnight storage of items.

Facilities will ensure the room has the standard setup — anything outside of standard setup is the user''s responsibility.

## Technology & AV Equipment

You may use TVs, HDMI cables, remotes, and basic audio items (where available). For any AV needs beyond standard room equipment, Facilities will contact Production for you.

## After-Hours Building Use & Responsibility

Transform Groups and ministries may use the building after hours with an approved Room Booking Request. Staff members are responsible for ensuring the person they authorize knows closing procedures. Staff cannot give out office codes, key copies, or access to staff-only rooms.

## Items & Decoration Guidelines

To maintain excellence and protect our building, avoid: glitter, confetti, paint, tape on walls, command strips, and any decorations in the Sanctuary. If decoration is essential, contact Facilities for guidance.

## Special Events & Outside Requests

- Outside organizations may not use the building without leadership approval.
- All events must be properly booked through the Room Booking Request Form.', 8
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'room-booking-guidelines');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'staff-communication-guidelines-tools-workflow', 'Staff Communication Guidelines: Tools & Workflow', 'Which communication tool to use for what — phone, text, Discord, GChat, Google Spaces, email, and Monday.com — plus the project assignment workflow.', '## Tools & How We Use Them

- **Phone Calls** — quick, time-sensitive information needed; emergencies.
- **Text Message** — time-sensitive information needed within the next few hours; emergencies.
- **Discord** — all dream team communication; announcements that go to all dream teams; staff chats; director & location lead chats. Desktop app should be installed for notifications.
- **GChat** — one-on-one messaging. Any one-on-one communication should go through GChat. Anyone with an assistant on staff can have the assistant in the chat instead of them. Chat follows the same rules as email — respond within 48 hours. Quick, one-time tasks that don''t require a multi-step process can also be given through GChat.
- **Google Spaces** — project maintenance; create a Google Space and assign who you need to communicate with on the project.
- **Email** — new project assignment (insert project/task, due date, ask them to create a Google Space if necessary; if multi-step, create a Monday board and assign participants; close the loop on email when the project is finished); formal FYIs or updates.
- **Monday.com** — project management (create a project board for a task involving a multi-step process with a deadline involving more than one staff person; must include assigned person and deadlines; archive once finished) and personal workload management (each person is required to have a personal Monday board with tasks that have due dates; we use the "mywork" tab to report out on priorities and deadlines; use common language like "this went on my Monday task board" to set reminders).

## Task/Project Workflow

1. New project assigned on email. If further questions or clarification are needed, use GChat or set up a quick 15-minute clarification meeting — send an agenda ahead of time with all questions.
2. Define the project type:
   - **Assigned only to you**: add it to your Monday personal board; give progress updates via email or in your oversight meeting; email when finished and the loop is closed.
   - **Assigned to you and others**: define the driver (likely you); create a Google Space with everyone involved for communication; create a Monday.com board assigning person, deadline, and steps; use the Monday board for project tracking and the Google Space for quick communication.
3. Project completion — archive the Monday board and close the loop on email with the original project assigner.

## Communication Workflow in Action (Examples)

**Phone Call** — urgent/emergency or time-sensitive situations. Example (urgent): "It''s 7:45am and the alarm won''t disarm at the Lyndhurst campus. The service is starting soon" — the location lead immediately calls the Ops Director instead of texting or emailing. Example (time-sensitive): wondering why the Thrive AC isn''t working before Sunday, or moving a meeting back within the next couple hours during the work week.

**Text Message** — time-sensitive or emergency. Example (urgent): "Hey, called you and you didn''t pick up. X happened, please call ASAP." Example (time-sensitive): "For this next meeting, need to push back 15 mins," or sending an update by 4:30 on a key conversation your oversight asked you to have.

**Discord** — team-wide communication, Dream Team coordination, announcements, or casual updates. Keep communication with your teams on Discord rather than text — create channels for you and your non-staff directors, and route Sunday communication through there too. Example: dream team appreciation party reminders, team night sign-ups, event reports posted to Monday.com.

**GChat** — quick, one-time tasks, clarification, or communication that doesn''t require a multi-step process. Example: "Hey Ashley, did we ever get the approval from the speaker for their travel itinerary?"

**Google Spaces** — ongoing project communication between staff (file sharing, task assignments, updates). Example: "Let''s start a Space for Easter Weekend Planning — we''ll add all creative, admin, and location leads here to track tasks and share assets."

**Email** — formal communication, new assignments, external vendor communication, or official record keeping. Example: sharing an updated policy, notifying staff of a day off, assigning a new project with an expected date and expectations, or closing the loop that a project is complete.', 9
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'staff-communication-guidelines-tools-workflow');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'gchat-google-spaces-notifications', 'GChat & Google Spaces Notification Setup', 'Step-by-step instructions for adjusting Google Chat and Google Spaces notification settings on desktop and mobile.', '## GChat — Setting Yourself Up for Success

### On Desktop (Gmail or chat.google.com)

**To adjust general chat notifications:**
1. Open Gmail or chat.google.com.
2. Click the gear icon (top right) → See all settings.
3. Go to the "Chat and Meet" tab.
4. Under Chat notifications, choose On (you''ll get notifications) or Off (no browser notifications).

Tip: you may also need to block or allow notifications in your browser settings (like Chrome).

**To mute notifications for a specific Chat or Space:**
1. Open the Chat or Space.
2. Click the three dots next to the name.
3. Select "Notifications."
4. Choose: All messages / Only @mentions / Off.

You can also choose how long to mute (e.g. for 8 hours, 1 day, or indefinitely).

### On Mobile (iOS or Android)

1. Open the Google Chat app.
2. Tap your profile photo (top right).
3. Tap "Notifications."
4. You can turn notifications off entirely, or set preferences for individual chats/spaces.

## Google Spaces — Setting Yourself Up for Success

### Change Notifications for a Specific Space

1. Open Gmail or go to chat.google.com.
2. On the left, find the Space you want to manage.
3. Hover over the Space → click the three dots.
4. Select "Notifications."
5. Choose your preference: All messages (get notified for every message in that Space), @mentions only, or Off.
6. (Optional) Choose how long you want that setting to apply (e.g. for 8 hours, 24 hours, or always).', 10
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'gchat-google-spaces-notifications');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'staff-kitchen-guidelines', 'Staff Kitchen Guidelines', 'Rules for keeping the staff kitchen clean, including leftover disposal, tupperware, and who may use the staff kitchen versus the main kitchen.', '- All leftovers in the fridge will be thrown away at the end of day on Thursday.
- Return any washed items to their original location.
- All tupperware not collected by the end of the month will be thrown away.
- Please keep all snacks in the correct bins and organized.
- Please wipe down countertops after use.
- Wash anything you use.
- If you see the drying rack is full, unload it and put items into the proper cabinet.

Please note: the staff kitchen, located off the main foyer, is to be used only by staff and anyone assisting staff (such as ABs). The Main Kitchen, located off the sanctuary, is accessible to all who need it, and has a fridge and sink.', 11
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'staff-kitchen-guidelines');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'williams-center-firearms-policy', 'Williams Center Firearms Policy', 'The Williams Center''s no-weapons policy for Guest Safety Team and staff, and how Transform Church partners with local law enforcement for armed response.', 'Effective June 2026

The Williams Center is implementing a no-weapons policy. To align with this policy, Transform Church requires all Guest Safety Team (GST) members and Transform Staff serving at the Williams Center to refrain from carrying firearms or other weapons while on site, effective immediately.

This policy applies only to Guest Safety Team members and Transform Staff serving at the Williams Center during services, events, rehearsals, or church-sponsored activities held at this facility.

Transform Church partners with the Bergen County Sheriff''s Office and local law enforcement agencies to ensure appropriate armed response and legal authority when necessary. Their role includes:
- Providing professional armed response when required.
- Responding to emergency and safety situations that extend beyond the scope of the Guest Safety Team.
- Coordinating with TC Staff emergency contact during incidents and emergency situations.

This partnership allows the Guest Safety teams to remain focused on awareness, communication, hospitality, and escalation, while armed authority is handled exclusively by trained law enforcement professionals.', 12
FROM "wiki_categories" c
WHERE c."slug" = 'workplace-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'williams-center-firearms-policy');
--> statement-breakpoint
INSERT INTO "wiki_categories" ("slug", "name", "description", "sort_order")
VALUES ('time-hours-reviews', 'Time Off, Hours & Reviews', 'Policies covering how to request time off, PTO and vacation allowances, staff work hours, performance reviews, and maternity/paternity leave.', 3)
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'how-to-request-time-off', 'How to Request Time Off', 'The step-by-step process for requesting PTO or unpaid time off, and the guidelines to follow before, during, and after your time away.', 'Last updated: 1/27/26

All forms are to be completed electronically by downloading the form and opening it as a PDF, which will populate the fields to fill in. Forms can be found in the Transform Church Staff Shared Drive under the Request Time Off folder.

## If You Are an Employee With PTO Time

1. Complete the PTO form and submit a printed copy to your oversight with **10 working days notice**.
2. If completing a PTO form with less than 10 days notice, you must submit your request with plans.
3. Oversight approves/denies PTO and signs the form. If the oversight has a direct report, they give the PTO form to the direct report to sign.
4. Oversight gives the PTO form to HR to check for staff days left/used, scheduling conflicts, and big events. HR adds the PTO to the calendar and documents the PTO form.
5. If the request is approved, HR gives the form back to the employee. If denied, HR gives the form to the oversight to discuss with the employee.

## If You Are an Employee Without PTO Time

1. Complete the Time Off form and submit a printed copy to your oversight with **10 working days notice**.
2. Oversight completes the form. If the oversight has a direct report, they give the form to the direct report to sign.
3. Oversight gives the time off form to HR to check for scheduling conflicts and big events. HR adds the time off to the calendar and documents the form.
4. If the request is approved, HR gives the form back to the employee. If denied, HR gives the form to the oversight to discuss with the employee.

## Time Off Guidelines

- Set a bounce-back email with a point of contact, and notify that point of contact that they''ve been assigned — let them know what they can contact you for, and what not to contact you for, in case of an emergency.
- Before leaving, post a message in the staff Discord channel reminding people that you are going and who the point of contact is.
- If you are leaving for more than 2 days (or as needed, at the oversight''s discretion), send your oversight a written plan for your area at least **3 days prior** to taking off. If you are a contractor, arrange with your oversight ahead of time whether work can be accomplished ahead of schedule or another contractor is needed.
- When you come back, check in with a progress report on how the plans went.
- Decline all meetings while you are away — you can do this quickly by setting an out-of-office on Google Calendar.', 0
FROM "wiki_categories" c
WHERE c."slug" = 'time-hours-reviews'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'how-to-request-time-off');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'vacation-weekend-vacation-allowances', 'Vacation & Weekend Vacation Allowances', 'How PTO accrues by years of service for full-time and part-time employees, and how many Sunday vacation days each staff level is allowed.', '## Vacation

- **1-5 years of service**: 15 days
- **Each year after**: 1 additional PTO day (max 20 days)

Full-time employees, whose employment agreement does not state otherwise, will receive 15 days of PTO after completion of the **90-day introductory employment period**. The employee is eligible to take designated PTO to correspond to the number of weeks between the hire date and the end of the calendar year.

After 5 years of employment, an extra day of PTO is added for the full-time employee. Each year thereafter, an extra day is added, for a maximum of 20 days of PTO.

Part-time employees, whose employment agreement does not state otherwise, will receive **10 days of PTO per year**. Employees who work less than 15 hours per week are considered hourly or contract employees — they are only paid per hour of work, and vacation time is not paid for.

Requests for vacation time off must be in writing and submitted to your supervisor for approval at least **ten (10) working days in advance**. Vacations are granted with consideration to date of request, seniority, and staffing needs.

Vacation days do not accrue and must be used by the end of the calendar year. We encourage all employees to take vacation. Non-exempt, temporary, and independent contractors are not allotted PTO days, unless otherwise stated in their employment agreement.

## Weekend Vacations

Weekend services at Transform Church are of a higher priority than other days. As a result, the number of days you can take as Sunday Vacation is limited based on staff level. All Sunday vacation days (including any additional requested days) must be approved by the employee''s supervisor.

- **Executive / Senior Pastors**: as needed
- **Full-time Pastoral Staff**: 5 days
- **All Full-time Staff**: 5 days
- **Part-time Staff**: 5 days (based on Sunday responsibilities, determined by the supervisor)', 1
FROM "wiki_categories" c
WHERE c."slug" = 'time-hours-reviews'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'vacation-weekend-vacation-allowances');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'staff-hours', 'Staff Hours', 'The list of full-time staff and their scheduled office hours, including the standard schedule and named exceptions.', '## Full Time Staff Hours

Standard schedule (unless noted otherwise below): **Monday–Thursday 8:30–4:30, Sunday 7:30–4:30**.

- Pastor Anthony — Monday-Thursday: 8:30-4:30; Sunday: 7:30-4:30
- Pastor Miriam
- Pastor Magno
- Pastor Katie
- Hitalo Oliveira
- Ashley Ledezma
- Nicole Gonzalez
- Ed Diomede
- Sarah Pinto
- Sarah Oliveira
- Eynar Ledezma
- Priscilla Flowers
- Lauren Santos
- Sherilyn Blake
- Chris Flowers
- Eloi Musafiri
- Isabela Maury
- Darbi Gomez
- Darren Morris
- Andrew Hartwig — Tuesday-Thursday: 8:30-4:30; Friday: select hours; Sunday: normal staff hours', 2
FROM "wiki_categories" c
WHERE c."slug" = 'time-hours-reviews'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'staff-hours');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'staff-reviews-policy-smart-goals', 'Staff Reviews Policy & SMART Goals', 'How quarterly staff reviews work, reviewee responsibilities and deadlines, and how to write SMART professional and personal goals.', 'Last updated 11/28/23

Transform Church Staff reviews are conducted **quarterly**. Every staff member is reviewed by their oversight. If a staff member has more than one oversight, they will be present as well. If a staff member only has one oversight, it is up to the oversight whether they''d like anyone additionally present.

## Guidelines for Reviewee

- Reviews are to be completed electronically and shared with the reviewer upon completion **at least 48 hours in advance**.
- Print a copy of the review for your reviewer and bring it to your review.
- Within **48 hours** of the completion of the review, document your next steps on your review paperwork (shared with the reviewer) and tag them in a comment on the next steps so it notifies them. The reviewer will reply back with approval of goals.

## Guidelines for Next Steps

- The reviewee will come up with a minimum of 3 professional goals and 1 personal goal (professional goals may exceed 3).
- Before leaving the review, a common, shared idea of topics for the areas must be agreed upon by the reviewer and reviewee.
- Upon completion of the review, the reviewee has **48 hours** to turn the topics into SMART goals and submit them to their oversight for approval.

## What Are SMART Goals?

SMART is an acronym for Specific, Measurable, Achievable, Relevant, and Timely.

1. **Specific** — thinking through questions helps get to the heart of what you are aiming for.
2. **Measurable** — quantifying your goals makes it easier to track progress. Can you add measurable and trackable benchmarks? Example: if your goal is to grow in organization, will you build a system for 3 of your projects, or spend a half hour per day organizing your emails?
3. **Achievable** — ask yourself if this goal is reasonable for your calendar and workload in this season.
4. **Relevant** — what you choose to work on should be a top priority for both you and your oversight, and have the greatest impact on the big picture.
5. **Time-Bound** — is this goal able to be achieved in the 3 months before the next review?

**Examples of a Professional SMART Goal**: "Grow my Events Dream Team by 4 people in the next 3 months." Or: "Improve my time management skills by taking 30 minutes every Sunday to review my calendar and MYWORK tab on Monday.com from April-June."

Note: the achievable and relevant components are decided ahead of time but not written into the actual goal itself — you should be able to explain verbally why the goal is relevant and achievable.', 3
FROM "wiki_categories" c
WHERE c."slug" = 'time-hours-reviews'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'staff-reviews-policy-smart-goals');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'maternity-leave-policy', 'Maternity Leave Policy', 'Transform Church''s maternity leave benefit — up to three months at full salary through combined state and church pay — and how it differs from NJ state programs.', '## Purpose

Transform Church supports employees during the significant life event of welcoming a child. This policy explains the church''s maternity leave benefit, how it interacts with New Jersey Temporary Disability Insurance (TDI) and Family Leave Insurance (FLI), and clarifies the scope of Transform Church''s internal provisions compared to state programs.

## Clarification of State Benefits vs. Transform Church Policy

- TDI and FLI are state-administered wage replacement programs; they are not a Transform Church benefit.
- While state programs may allow income benefits for longer periods, Transform Church''s policy does not provide job protection or salary supplementation beyond the approved three months.

## Transform Church Maternity Leave Benefit

- Transform Church provides up to **three (3) months** of approved maternity leave. This is separate from accrued vacation or sick time, and is not extended beyond three months.
- This leave must be taken **consecutively**.
- Full salary continuation during this leave is achieved through a combination of TDI/NJFLI benefits and supplemental pay from Transform Church.
- To receive this benefit, employees must apply for TDI/FLI. TDI/FLI provides up to **85%** wage replacement, and Transform Church supplements the remaining amount so the employee receives **100% salary** during the three months.
- **Advance Payment Option**: if allowable, employees may elect to receive the supplemental salary difference in advance of TDI/FLI benefits, to help bridge the gap during the waiting period (which can take several weeks to begin). Once state benefits begin, any necessary payroll adjustments or reconciliations may be made.
- Employees are encouraged to submit the Transform Church **TDI/FLI Internal Request Form 90 days in advance** of intended leave, submitted to HR admin, Finance & Business Manager, and Operations Director.

## Extended Leave Requests

- Requests for additional leave beyond the approved three months are not considered part of the maternity leave benefit — they are evaluated separately under regular time-off policies and role requirements.
- Employees may request additional unpaid leave beyond the three months, but this is subject to approval.

## Key Distinctions

- **Transform Church Policy** = 3 months paid leave (100% of salary via NJTDI/NJFLI + Transform Church supplement).
- **NJFLI benefit** = state-provided wage replacement for up to 12 weeks; may exceed company-approved leave.
- **NJTDI benefit** = state-provided wage replacement for up to 4 weeks; may exceed company-approved leave.
- **Job protection** = determined by NJFLA or FMLA, not NJFLI.

## Internal Request Form

Transform Church uses a **TDI/FLI Internal Request Form** to track maternity/paternity/other leave requests. It captures: employee information (name, job title, department, date of hire, phone/email); type of leave requested (maternity, paternity, or other — adoption, caring for a parent, foster care placement); leave timing (estimated due/placement date, requested leave start date, requested return-to-work date, and whether the schedule is consecutive or other); and required documentation (proof of birth/adoption/foster placement, medical certification, and confirmation of the NJTDI/NJFLI application once filed). The form is signed by the employee and reviewed by an HR representative.

For full detail on the New Jersey TDI and FLI state programs referenced above (eligibility, benefit amounts, how to apply, and job protection), see the "NJ State Leave Benefits Reference" article in this category.', 4
FROM "wiki_categories" c
WHERE c."slug" = 'time-hours-reviews'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'maternity-leave-policy');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'paternity-leave-policy', 'Paternity Leave Policy', 'Transform Church''s paternity leave benefit — up to four weeks at full salary through combined state and church pay — and how it differs from NJ state programs.', 'Transform Church values family and recognizes the importance of time spent bonding with a new child. This policy outlines the church''s paternity leave benefit and clarifies how it interacts with state-provided benefits under New Jersey Family Leave Insurance (NJFLI), and the scope of Transform Church''s internal provisions compared to state programs.

## Clarification of State Benefits vs. Transform Church Policy

- FLI is a state-administered wage replacement program; it is not a Transform Church benefit.
- While state programs may allow income benefits for longer periods, Transform Church''s policy does not provide job protection or salary supplementation beyond the approved four weeks.

## Transform Church Paternity Leave Benefit

- Transform Church provides up to **four (4) weeks** of paid paternity leave following the birth of a child. This is separate from accrued vacation or sick time, and is not extended beyond four weeks.
- This leave must be taken **consecutively**.
- Full salary continuation during this leave is achieved through a combination of NJFLI benefits and supplemental pay from Transform Church.
- Employees must apply for NJFLI. NJFLI provides up to **85%** wage replacement, and Transform Church supplements the remaining amount so the employee receives **100% salary** during the four weeks.
- **Advance Payment Option**: if allowable, employees may elect to receive the supplemental salary difference in advance of FLI benefits, to help bridge the gap during the waiting period (which can take several weeks to begin). Once state benefits begin, any necessary payroll adjustments or reconciliations may be made.
- Employees are encouraged to submit the Transform Church **TDI/FLI Internal Request Form 90 days in advance** of intended leave, submitted to HR admin, Finance & Business Manager, and Operations Director.

## Extended Leave Requests

- Requests for additional leave beyond the approved four weeks are not considered part of the paternity leave benefit — they are evaluated separately under regular time-off policies and role requirements.
- Employees may request additional unpaid leave beyond the four weeks, but this is subject to approval.

## Key Distinctions

- **Transform Church Policy** = four weeks paid leave (100% of salary via NJFLI + Transform Church supplement).
- **NJFLI benefit** = state-provided wage replacement for up to 12 weeks; may exceed company-approved leave.
- **Job protection** = determined by NJFLA or FMLA, not NJFLI.

## Internal Request Form

Transform Church uses the same **TDI/FLI Internal Request Form** described in the Maternity Leave Policy to track paternity leave requests, capturing employee information, leave type, leave timing, and required documentation (proof of birth/adoption/foster placement, medical certification, and confirmation of the NJFLI application once filed), signed by the employee and reviewed by an HR representative.

For full detail on the New Jersey FLI state program referenced above (eligibility, benefit amounts, how to apply, and job protection), see the "NJ State Leave Benefits Reference" article in this category.', 5
FROM "wiki_categories" c
WHERE c."slug" = 'time-hours-reviews'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'paternity-leave-policy');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'nj-state-leave-benefits-reference', 'NJ State Leave Benefits Reference (TDI & FLI)', 'A reference on how New Jersey Temporary Disability Insurance and Family Leave Insurance work, referenced by Transform Church''s maternity and paternity leave policies.', 'Transform Church''s maternity and paternity leave benefits work alongside two New Jersey state wage-replacement programs: Temporary Disability Insurance (TDI) and Family Leave Insurance (FLI). This article summarizes those state programs as referenced in Transform Church''s leave policies.

## NJ Family Leave Insurance (FLI)

Family Leave Insurance benefits can partially replace your wages when you have to stop working to care for a family member/loved one with a physical or mental health condition, bond with a new child, or handle certain matters related to domestic or sexual violence.

- **Eligibility**: most New Jersey employees qualify. You must meet earnings requirements in the 18 months prior to the start of your claim; see the current year''s requirements at myleavebenefits.nj.gov.
- **Benefit amount**: receive **85%** of your average weekly wages, up to a maximum (see the current year''s max weekly benefit level at myleavebenefits.nj.gov).
- **Length of benefits**: one continuous period of leave for up to **12 consecutive weeks (84 days)**, or split into multiple periods for a maximum of **56 days (8 weeks)**.
- **When to apply**: you can start the online application up to 60 days in advance and save it as a draft; once leave begins, return to certify and submit. If applying after leave begins, you have **30 days** from your first day of leave to file. It can take **two to six weeks** to approve a claim and pay benefits once a complete application is received.
- **Bonding with a new child**: you may apply for Family Leave benefits any time during the **first year** after the child was born, adopted, or placed in your care. Birthing parents can also receive Temporary Disability Insurance benefits when they stop working before giving birth and while recovering.
- **Caregivers**: apply for caregiving benefits at myleavebenefits.nj.gov/caregiver; information is needed from you and your loved one''s medical provider.
- **Domestic/sexual violence**: FLI supports employees who are victims/survivors, or who are assisting a victim/survivor — see myleavebenefits.nj.gov/survivors.
- **If currently unemployed**: if it''s more than 14 days after your last day of work and you are not on an employer-approved leave of absence, you may be eligible for Family Leave During Unemployment benefits.
- **Job protection**: NJFLI is a wage replacement program, not job protection — your job may be protected under the Family and Medical Leave Act (FMLA), New Jersey Family Leave Act (NJFLA), or the New Jersey SAFE Act. If an employer retaliates against you for taking FLI benefits, you have the right to take private legal action.

## NJ Temporary Disability Insurance (TDI)

Temporary Disability benefits can partially replace your wages when you have to stop working due to a physical or mental health condition or other disability unrelated to your work, including pregnancy/childbirth and COVID-19.

- **Eligibility**: you must meet earnings requirements in the 18 months prior to your claim, stop working due to an illness/injury not caused by your job, and be under the care of a licensed medical provider.
- **How to apply**: apply online at myleavebenefits.nj.gov. It''s your responsibility to ensure a complete application — including the medical provider portion — is submitted. You can start the application up to 60 days in advance and save it as a draft; if applying after leave begins, you have **30 days** from your first day of leave to file. It can take **two to six weeks** to approve a claim and pay benefits.
- **Benefit amount**: receive **85%** of your average weekly wages, up to a maximum. Your medical provider certifies how long you need to recover, up to a maximum of **26 weeks**.
- **Pregnancy/childbirth recovery**: TDI provides cash benefits for pregnant parents when they need to stop working before giving birth and while recovering afterward; parents can transition directly from TDI to FLI bonding benefits.
- **Job protection**: TDI is a wage replacement program and does not provide job protection — your job may be protected under the federal FMLA (generally, employers with at least 50 employees must provide up to 12 weeks of job-protected, unpaid medical leave; notice to your employer may be required). If an employer retaliates against you for taking or seeking TDI benefits, you have the right to take private legal action.

## For Further Assistance

**Temporary Disability and Family Leave Insurance**
- Phone: 609-292-7060 (Monday–Friday, 8:00am–4:30pm)
- Fax: 609-984-4138
- Mail: PO Box 387, Trenton, NJ 08625
- Hearing-impaired individuals may inquire via the Telecommunication Device for the Deaf (TDD): 609-292-8319, or the NJ Relay Service at 1-800-852-7899.
- Learn more at myleavebenefits.nj.gov.', 6
FROM "wiki_categories" c
WHERE c."slug" = 'time-hours-reviews'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'nj-state-leave-benefits-reference');
--> statement-breakpoint
INSERT INTO "wiki_categories" ("slug", "name", "description", "sort_order")
VALUES ('kids-youth-policies', 'TC Kids & TransformYouth Policies', 'Policies and procedures for staff and volunteers serving children and students, including TC Kids onboarding, safety, and TransformYouth ministry guidelines.', 4)
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'tc-kids-onboarding-mission-values-steps', 'TC Kids Onboarding: Mission, Values & Volunteer Steps', 'TC Kids'' mission and values, and the onboarding steps a new volunteer completes, from background check through shadowing a teacher.', '## Welcome on Board

Attached to your onboarding are the following, which you need to print and fill out:
- Background check (required by law to work with children)
- Code of conduct
- Policies & procedures documents

Please read through thoroughly, as it is very important information.

Once we have your paperwork, the next steps include:
1. **Planning Center** — your information will be added and you will be scheduled via the app. You can serve once a month or every week — let us know what''s convenient for you.
2. You will receive a **t-shirt** that you are expected to wear each time you are scheduled to serve.
3. You will **shadow another teacher**. We will set up a meeting afterward to discuss any feedback or concerns you may have.

## About This Handbook

The purpose of the TC Kids Handbook of Policies and Procedures is to provide policies and procedures for the Children''s Ministry of Transform Church. Changes may be made from time to time without prior written or oral notice.

## Vision and Values

**Mission**: We believe that every department should be united in heart with the mission of the church. Transform Church''s mission is to reach, teach, and empower people to impact their generation for Christ — it is the heartbeat of TC Kids to do the same.

**Vision**: We want to create a vibrant, excellent, safe environment where kids are growing in faith, passion, and their relationship with God, and are counting the days to come back! We want to empower kids to make a difference in their world!

**Values**:
1. Bible-based
2. Spirit-led
3. Child-targeted
4. Parent-supportive
5. Relationship-driven
6. Safe: physically, emotionally, spiritually
7. Creative, relevant, and fun!', 0
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'tc-kids-onboarding-mission-values-steps');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'tc-kids-team-member-policies', 'TC Kids Team Member Policies', 'Requirements to join the TC Kids serving team, scheduling and attendance expectations, and personal care/dress code standards for volunteers.', '## Requirements

Because we love our children and desire to protect them, Transform Church requires all volunteers working with children to complete the following before joining the TC Kids Serving Team:
1. Submit a TC Kids online volunteer questionnaire with references, for initial review.

TC Kids Leadership reserves the right to accept or deny a volunteer questionnaire submission. Upon acceptance of initial review, volunteers must then complete:
1. **Background Check** (18 years and older).
2. Agreement to comply with the Policy & Procedures and Code of Conduct.
3. Must have completed **THRIVE**.
4. Must be **11 years old or older** — 11-14 year olds may serve in limited capacities as determined by leadership, and must be regularly attending Transform Church''s Youth group.

## Expectations

1. **Arrival Time** — Team Members should arrive at the time designated by TC Kids Leadership.
2. **TC Kids T-shirt** — all team members are required to wear their TC Kids t-shirt when serving.
3. **Scheduling** — TC Kids Leadership uses "Planning Center Online" to create a monthly schedule. Planning Center should be the primary method to communicate availability, including blocking out dates for unavailability.
4. **Absences** — team members are responsible for reporting an absence, planned or unforeseen, to a member of TC Kids leadership as soon as possible.
5. **Departure** — team members must remain at the TC Kids event/service until the last child has been picked up by a parent, or until relieved by a member of leadership. If there is another service following, ensure your area is clean and ready for the next group of children. If serving at the last service of the day, help pack up and store TC Kids resources and materials in the designated storage areas.

## Involvement

1. **Preparation** — read your lesson before you arrive in your classroom on Sunday. Often the best advice for classroom management is being prepared.
2. **Prayer** — pray for your kids and your patience consistently. Ask for guidance, discernment, and confidence as you lead the class.

## Personal Care

All team members are expected to present themselves modestly in consideration for parents, visitors, leaders, other team members, and the congregation.

**Dress Code**: attire when working with children must be neat, clean, and appropriate. Please wear your TC Kids t-shirt. If serving with Infants, Toddlers, and Pre-School, please refrain from using heels — consider slippers or comfortable, clean shoes, as you may be walking where children are crawling. Keep in mind that when working with kids you may be bending over, leaning forward, kneeling down, and running around — movements that can cause clothing to become revealing.', 1
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'tc-kids-team-member-policies');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'tc-kids-classroom-policies-procedures', 'TC Kids Classroom Policies & Procedures', 'Classroom access, adult-to-child ratios, promotion, wellness/medication rules, snack and allergy handling, check-in/checkout, diapering, classroom management, and physical contact guidelines.', '## General

1. For the protection of team members and children, the TC Kids Entry door (in the foyer) will remain closed during service. Only TC Kids team members, parents, and approved volunteers of Transform Church will have access to the TC Kids area.
2. If you notice any unfamiliar person in the classroom, ask their identity and notify Kid''s Alive leadership immediately.
3. A parent should be called from service if a child is completely inconsolable (after at least **10 minutes** in our care), ill, injured, has a disciplinary issue, or is a danger to themselves or other children. All TC Kids Team Members should immediately radio TC Kids leadership in these cases, and leadership will contact the parent.
4. Parents are to be notified and an **Incident Report** completed as soon as possible if an injury occurs in the classroom, or in the event of a biting situation. Each report should be completed, signed by a parent, and turned in to a member of Kid''s Alive Leadership.

## Ratio

1. **Team Member Policy** — two team members should remain together with children at all times, other than the 4th-5th grade age group, for the safety and protection of both children and team members.
2. Adult-to-child ratios by age:
   - Infants: **4 children to every adult**
   - Toddlers: **6 children to every adult**
   - Preschool (3-4): **8 children to every adult**
   - Elementary (5-10): **8 children to every adult**

## Promotion

TC Kids promotes children to the next class level once each year, at the beginning of the school year (**September**), based on their grade. Children remain in their class level until the next promotion date, unless given specific permission by the TC Kids Director.

## Wellness/Medication

Any child with the following symptoms will not be allowed to participate with other children — a parent/guardian will be notified and the child picked up in a timely manner:
- Fever over 100°F
- Vomiting in the last 24 hours
- Diarrhea in the last 24 hours
- Skin rashes or eruptions of unknown origin (e.g. impetigo, measles, chicken pox)
- Persistent coughing associated with respiratory infection (cold, bronchitis, etc.)
- Runny nose with yellow- or green-colored discharge or congestion associated with a cough or fever
- Conjunctivitis (pink eye) with colored discharge or drainage
- Parasites, any form of lice, mites, or ringworm

Only the parent or guardian of a child is allowed to administer any form of medication to a child.

## Feeding, Snacks & Allergies

**Infants & Toddlers**: any allergies will be listed on the child''s name tag; if unclear, ask parents at drop-off. If a child can''t have one of our pre-approved snacks, communicate it to all team members in the classroom, and the parent should provide a safe snack. Pre-approved snacks may include cheerios, goldfish, and animal crackers. When checking in an infant, ask for detailed instructions on feeding and diaper changing, and follow them carefully.

**Preschool**: pre-approved snacks include goldfish, animal crackers, and cheerios. Check name tags for allergies before serving a snack — if in doubt, do not give it. Ask parents at pick-up about allergies and give notes to TC Kids Leadership.

**Elementary**: when activities call for a snack, check children''s tags for allergies; check with parents first whenever possible.

**All Departments**: all food brought to share with children must be store-bought and approved by parents and TC Kids Leadership. No homemade food will be given to children unless made by their own parents and brought specifically for them.

## Check-In

1. Parents may check in their children **15 minutes** before any service. Volunteer/staff children can be registered upon arrival, but the TC Kids Team is not responsible for them until TC Kids service begins and they are brought to their classroom.
2. Have each child complete the check-in process and attach the name tag to the child''s garment; hand the parent or guardian their guardian receipt.
3. On a first visit, a new account is created on the computer and the visitor box checked off; child and parent ID badges with matching numbers are then issued.
4. One team member should be responsible for checking each child into the room (greeting, asking for special instructions, taking attendance, etc.).
5. The parent or guardian must provide the matching guardian receipt when checking a child out. If the receipt is not available, the classroom leader calls the TC Kids leader on duty (via radio) to assist with the release.
6. No person under the age of **16** is allowed to claim a child out of the classroom without the matching claim receipt and written permission on file.
7. TC Kids Team Members are required to remove each child''s name tag label before releasing them to a verified adult — this notifies security the child has been properly checked out and protects the child from strangers knowing their name outside of church.
8. Various custody arrangements prevent us from releasing a child into a parent''s care if they do not have the matching ID tag.

## Lost Parent & Child ID Badges

1. If either the parent or child loses their ID badge, they will be asked to wait patiently until all other children are excused so the situation can be addressed.
2. The appropriate team member gives the parent or guardian a Child Release Form to complete, and requests to see their driver''s license or state ID — a form is needed for each child with a lost ID tag.
3. If the parent has more than one child, the team member who performed the ID check escorts the parent to the next child''s room to aid in that release.

## Parent Paging System

If we need to reach a parent during service, we use the Parent Paging System — only when absolutely necessary — via the child''s security number displayed on the screens. Situations requiring a page include:
- Injury (beyond the little boo-boo)
- Sickness (vomiting, fever, etc.)
- Extreme discipline issue
- Inconsolable crying (10+ minutes)

## Diapering/Restroom Policy

**Diapering**: diapers of all infants and toddlers should be checked, and changed if necessary, before the end of service; if present for more than one service, change at least once or as needed.
- Change all diapers in full view of other team members in the classroom, and only on designated changing stations.
- Have all supplies ready before placing the child on the changing pad — no child should ever be left unattended on the changing table.
- Wear a new pair of gloves with each diaper change.
- Spray the changing pad with disinfectant and wipe clean between each change.
- Wash hands or use hand sanitizer after each diaper change.

**Restrooms**:
- We ask that parents take their child to the restroom before service.
- If a child needs assistance, the class goes together, with 2 teachers always present.
- If a child doesn''t know how to use the bathroom by themselves, the stall door is left open while one female volunteer assists and another monitors the bathroom.
- If the child is old enough to go by themselves, the stall door is closed but the bathroom is monitored by team members as needed.

## Classroom Management

1. There is to be **no corporal punishment** of any kind for any reason (i.e. spanking, pinching).
2. Review classroom rules with children frequently: obey the teacher; listen and be respectful; be kind; keep hands and feet to yourself.
3. Preventative steps: create a loving, caring atmosphere; establish realistic expectations; focus on positive actions; be fair and consistent; be prepared.
4. **Corrective actions**: try to handle issues individually; give verbal redirection when a child isn''t following the rules; redirection should not be harsh or demeaning; explain the wrong behavior and redirect with language about what you want done; if behavior does not cease, use the walkie-talkie to contact Kid''s Alive leadership.

### Physical Contact

TC Kids is committed to protecting children in its care and recognizes that appropriate touch is part of a positive, nurturing environment.

Appropriate ways to touch kids (using good judgment): an arm around the shoulder; walking hand in hand; carrying small children piggy-back; short congratulatory or greeting hugs; a brief, assuring pat on the back or shoulder; handshakes, high-fives, and knuckles.

A volunteer should **never**: touch a child in anger or disgust; touch a child in any manner that may be construed as sexually suggestive; touch a child between the navel and the knee; touch a child''s private parts (except for diaper or bathroom procedures). Physical contact in any form should be above reproach — do not force physical contact, touch, or affection on a reluctant child; a child''s preference not to be touched must be respected.

### Taboo Topics

Certain topics are best left for parents and their children — if you have a question about a topic''s propriety, speak with the teacher or leader in charge (as a rule of thumb, always stick to the lesson plan): the rapture & tribulation; Satan (if the purpose is to incite undue fear or confusion); Hell (if the purpose is to incite undue fear or confusion); denominations; speaking in tongues; human sexuality or reproduction; secular music, card games, etc.; wine/beer (whether it''s right/wrong to consume as an adult).

### Phones

During teaching time, phones should not be used to take pictures or videos of any children that are not your own. Transform Church photographers are the only authorized people who can take pictures using Transform Church equipment. Posting pictures or videos of any children during teaching time on personal social media is prohibited.', 2
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'tc-kids-classroom-policies-procedures');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'tc-kids-medical-emergency-procedures', 'TC Kids Medical & Emergency Procedures', 'Medical procedures, lost-child, lockdown, hazardous weather, fire, and evacuation procedures, plus the child abuse and media response policies.', '## Medical Procedures

- Minor injuries can be treated with care using whatever is needed inside the First Aid kit. Complete an **Incident Report** whenever you treat a child, and have a TC Kids leader sign it. Let the parent know what happened when they arrive.
- TC Kids team members are not authorized to dispense any over-the-counter or prescription medications, with the exception of diaper rash ointment with parental instruction only. If a child needs more assistance than we can provide, notify TC Kids leadership, and the parent will be notified.
- **Serious injuries** (broken bones, convulsions, fainting, unconsciousness, or other serious bodily injury): do not move the injured child — a team member must remain with them. Stay calm and speak in an assuring manner while another team member cares for the rest of the class. Have another team member radio security and/or find TC Kids leadership for assistance; security or leadership can radio stage managers to alert pastoral staff. The TC Kids Pastor or another staff member will call for medical assistance, or 911 if necessary, and will contact the parent and take over so you can return to the classroom. The TC Kids Pastor will contact you with updates on the child''s condition and may ask you for information to assist in reporting the incident.

## Emergency Procedures

### Lost Child Procedure

1. The Classroom Leader contacts Security and TC Kids Leadership via walkie-talkie immediately, and communicates a description of the child (age, hair color, eye color, clothing, and other significant characteristics).
2. Stay with parents and remain calm and reassuring — other members of TC Kids leadership will initiate a search.
3. Communication is maintained via walkie-talkie.

**TC Kids Leadership Plan for Lost Child**: contact the Security team; go to all logical locations to look for the child; double-check classrooms/small group areas; check large group environment areas; check surrounding classrooms and other age classes; check bathrooms; check the parking lot, parking garage, river areas, gazebo, and gas station. Put team members at exit doors to ensure no child has gone off unattended. If in **2-5 minutes** all areas have been checked and the child is not located, TC Kids leadership contacts the Security Team to decide on moving to lockdown procedures.

### Lockdown Procedure for TC Kids Area (in case of a lost child)

- Team members positioned at each door remain in place, calmly explaining why doors are remaining shut and asking for cooperation.
- No one leaves the TC Kids area.
- Notify all teachers/leaders/staff of the missing child and lockdown status.
- Security Team notifies the First Impressions foyer team and pastoral staff as necessary.
- Look in all logical places again, and stay in communication with security and all pertinent teams.
- Lockdown may be elevated to the entire building as necessary, not allowing any children to leave.
- The decision to call the police is made by the TC Kids Pastor, security team, and any other needed teams.

### Hazardous Weather

Stay calm. Infants, Toddlers, Preschool, and Elementary classes stay in their rooms — they are the safest location. Locate your binder and walkie-talkie, and await further instructions.

### Fire

Any attempt by team members to put out a fire is absolutely forbidden unless judgment to do so is unquestionable and presents no possible danger to anyone.

- **How you''ll know**: audible sound of alarm, or flashing strobe lights in every room.
- **What to do**: stay calm; ensure you''re wearing your walkie-talkie; if you''re not assigned to a classroom, report to the nearest classroom to assist or report to TC Kids Leadership for further instructions.
- **When to go**: when ordered to evacuate over walkie-talkie, when in immediate danger (smoke or flames), or when a fire alarm goes off — communicate via radio to TC Kids Leadership that you are evacuating.
- **Where to go**: in the event of any fire drill, all classes exit the building through the fire exit door off the TC Kids Worship Room, and move single file to the east side of the Empire Parking lot (near the grassy area parallel to Riverside Avenue and the Fuel gas station). If fire or police departments or Transform Church Security direct you to a different location, follow their lead. Parents may stay with you and assist, but may not take their child and leave during an evacuation.

### Evacuation Procedures

1. Classroom teachers remain with the class.
2. Oversight leads students and teachers out of the safest exit (in Lyndhurst, the exit door in the TC Kids Worship Room; if inaccessible, the TC Kids Lead works with security to exit the building safely).
3. Service Lead ensures all classes are lined up to go outside.
4. Service Lead ensures the Check-In Team heads to the infants and toddlers to assist during exit.
5. Service Lead and Oversight make the decision to leave within minutes of the alarm.
6. Service Lead ensures every TC Kids space, including bathrooms, has been evacuated.
7. Service Lead and Oversight stay with the teams until allowed back into the building.
8. Parents can pick up their children once the building has been exited and teachers have their head count — parents must use their parent tag to pick up as usual.

## Child Abuse Policy

Transform Church/TC Kids supports and maintains a **zero tolerance policy** against child abuse and neglect — including physical or mental injury, sexual abuse, negligent treatment, or maltreatment. Sexual abuse is defined as the use, persuasion, or coercion of any child to engage in any sexually explicit conduct (or any simulation of such conduct) for the purpose of producing a visual depiction of such conduct, or rape, molestation, prostitution, or incest with children.

It is against the law and against Transform Church/TC Kids policy for any volunteer, team member, or employed staff, male or female, to physically, sexually, or mentally abuse or neglect any child. Transform Church/TC Kids will neither condone nor tolerate infliction of bodily injury or physically/sexually abusive behavior toward a child; physical neglect (including failure to provide adequate safety measures, care, and supervision); or emotional mistreatment (including verbal abuse and/or verbal attacks).

It is our intent to follow state regulations in the reporting of child abuse — report any suspicions of possible mistreatment/abuse to TC Kids leadership immediately. Where reporting is deemed necessary, appropriate Church Alive staff will work closely with the witness, the family, and any helping agencies involved. Any suspected or alleged child abuse by a TC Kids team member or leader can result in temporary or permanent removal from TC Kids, pending the outcome of an investigation, to protect both the child and the leader.

## Media Response

In the event of a severe accident or death, media may be on site to cover the incident. It is important that all volunteers and team members not say anything that could be mistaken or misquoted. A Transform Church staff member or their designee shall be the only person to make any statement — if asked by a media member for a statement, please graciously decline and direct them to a Transform Church senior staff member.', 3
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'tc-kids-medical-emergency-procedures');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'tc-kids-infant-toddler-care-procedures', 'TC Kids Infant & Toddler Care Procedures', 'Cleaning, drop-off questions, tag-check-out rules, and dos and don''ts for under-18 volunteers caring for infants and toddlers at any Transform Church event.', 'The purpose of these procedures is to provide clear policies for the care of children during any and all Transform Church events, including Sunday Services, Special Services, and Transform or college groups.

## Cleaning

It''s very important to clean the rooms after use. Lysol wipes are in the blue bin, and should only be used on tables, the slide, toys, and the change table. Please take out the garbage and vacuum.

## Ask Parents

Cry It Out or Call — ask parents on arrival if they''d like us to contact them once the child starts crying, or to hold off for 15 minutes prior to contacting them. Ask parents if we''re allowed to diaper change, whether they have allergies, whether the child can have Cheerios, and about potty training. Make sure you or the parent write the child''s name on the whiteboard so you know which diaper bag belongs to which child.

## Upon Parent Arrival

As always, please check the tags — if a person doesn''t have a tag, they can''t take the child. This is team policy. We have a few aunts and cousins that try taking children, but we must see a matching tag before releasing a child to anyone; some children have custody issues. If tags aren''t being used (sometimes the case midweek), the adult leader in child care ensures each child is released to the person who dropped them off.

## Sundays

Children are not allowed to have electronics in the kids'' space — if they bring one, put it away and let them know they''ll get it back after service. Electronics are approved for midweek child care.

## Injuries

If there are any injuries, please advise the Adult in charge right away — they will ensure parents are advised at pick-up.

## Volunteers Under 18 (Sundays & Transform/College Child Care)

**Do''s**:
1. Play with the kids at floor level; entertain them (singing and dancing).
2. Assist with snack time.
3. Help clean up the room.
4. Ask for assistance when a break is needed.
5. If a parent has a major inquiry or concern, bring the Adult Serving to the conversation, or direct the parent to the Adult serving.

**Do Not''s**:
1. Do not pick up the children.
2. Do not receive children.
3. Do not dismiss children.
4. Do not take children to the bathroom unless with an adult.
5. Do not change diapers.', 4
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'tc-kids-infant-toddler-care-procedures');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'tc-kids-code-of-conduct-background-check', 'TC Kids Code of Conduct & Background Check', 'The TC Kids volunteer Code of Conduct and the required background investigation notice, including how to request the scope of your report.', '## TC Kids Code of Conduct

As a TC Kids volunteer, I understand that I am seen as a role model and an example for children who attend TC Kids. I agree to conduct myself in a manner that models the Christian faith and to adhere to the following guidelines:
- Using positive language and abstaining from excessive cursing or swearing.
- Conducting myself in a positive and appropriate manner on social media.
- Abstaining from the use of illegal drugs.
- Abstaining from smoking cigarettes and the use of tobacco products.
- Abstaining from sexual immorality (i.e. adultery, premarital sex, homosexuality, etc.).
- Abstaining from excessive use of alcohol that leads to drunkenness.
- Following the guidelines set out in the TC Kids Policies and Procedures Manuals.

## Notice — Background Investigation

In connection with your employment or volunteer work with Transform Church (the "Company"), a consumer report and/or investigative consumer report may be obtained from a consumer reporting agency for employment or volunteer work purposes. These reports may contain information about your character, general reputation, personal characteristics, and mode of living, and may involve personal interviews with sources such as your neighbors, friends, or associates. Reports may also contain information about your criminal history, credit history, driving and/or motor vehicle records, education or employment history, or other background checks.

You have the right, upon written request made within a reasonable time after receipt of this notice, to request disclosure of the nature and scope of any investigative consumer report by contacting the Company and **Protect My Ministry**, 14499 N. Dale Mabry Hwy., Suite 201 South, Tampa, FL 33618; Phone: **1-800-319-5581**. For information about Protect My Ministry''s privacy practices, see www.protectmyministry.com.

The scope of this notice is not limited to the present — if you are hired or accepted as a volunteer, it continues throughout the course of your employment or ministry and allows future screenings for retention, promotion, or reassignment, as permitted by law and unless revoked by you in writing.', 5
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'tc-kids-code-of-conduct-background-check');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'gst-sop-transform-youth', 'Guest Safety Team (GST) SOP - TransformYouth', 'Standard operating procedures for the Guest Safety Team at TransformYouth, covering arrival, entry/exit authorization, foyer monitoring, and incident reporting.', '**Training contact**: parents can be trained for SST & Fearless. Israel Tavarez has been faithful in this role and serves weekly for any questions: **(973) 332-2014**.

After any incident, an incident report should be done ASAP: [form.jotform.com/232204221992146](https://form.jotform.com/232204221992146)

**Official youth times**: **7:30-9:30pm**. Students begin to arrive at 5:30 for prayer, 6:30 for team rally, and 7:30 official start. Official end is 9:30, though students typically stay as late as 10:15.

## Overview

1. **Authorized Entry**
2. **Authorized Fearless Exit**
3. **Arrival Time Period**: 7:15
4. **Foyer Authorization**: 7:30-9:30pm
5. **Exiting Time Period**: 9:15-10:00pm
6. **SST Training**:
   - **Main Objective**: the main purpose of the Youth Safety Team is to protect students via surveillance — notice suspicious behavior around bathrooms and notify Youth Leaders, maintain control over the main entrance/exit, and assist in escorting students to parent vehicles.
   - **Incident Reporting**: any incident worth noting should be reported via the typical safety team portal.
   - **Win & Improve report** for the night should be reported to the GST Lead.
   - **Training**: GST training is a requirement.
   - **Age Group of Students**: speak to students appropriately, defer to a Youth Team member whenever possible, and when members are unavailable, maintain peace/order until a youth team member can address the conflict.

## Details

1. **Students may enter without a parent.** Most students are dropped off and sign in on their own. If a student is entering late, ensure they sign in and are registered.
2. **No student is to exit without GST identifying a parent is there.** Current policy is to escort the student to the parent''s vehicle and hand off to the parent. If suspicion arises, we have parents'' phone numbers on file to contact and confirm. Students who drove themselves are free to leave at will.
3. **Foyer Authorization (7:30-9:30pm)**: at 8pm, students are dismissed to the sanctuary and permitted to leave for bathroom breaks — apart from that, they should be in the sanctuary and not permitted to roam by themselves. If there is push back from a student, defer to a youth leader. At any point, a student may be prompted by Safety to have a leader verify that they are permitted to do as they are.
4. **Exiting Time Period (9:15-10:00pm)**: security escorts students from the front door to the vehicles parked in the parking lot. It is encouraged to have a touch of contact with each parent, whether by a quick exchange of words or a visual confirmation.
5. **GST Training**: recruitment & training.', 6
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'gst-sop-transform-youth');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'special-needs-at-transform-youth', 'Special Needs at Transform Youth', 'How Transform Youth supports students with special needs through family-provided aids, partial participation options, and advance coordination.', '## Mission and Heart for Inclusion

At Transform Youth, we believe that every student is created in the image of God and holds a unique place in the Body of Christ. We have a deep heart for students with special needs and believe that God meets them exactly where they are when we provide an opportunity for connection and worship. Our goal is to foster an environment where every student can experience the love of Jesus in a safe and supportive community.

## Purpose of Policy

To ensure the safety, engagement, and spiritual growth of all participants, this policy outlines the support structures available for students who require one-on-one assistance to navigate our youth ministry programming successfully.

## One-on-One Support Guidelines

Our current volunteer ratios do not allow us to provide dedicated, one-on-one aids, so we''ve established the following partnership model:
- **External Support Persons** — families are encouraged and welcome to provide a personal one-on-one aid to accompany their student throughout the program.
- **Vetting Requirements** — any family-provided aid must successfully complete Transform Youth''s standard background check and a brief safety orientation prior to serving in the youth space.
- **Collaboration** — the aid works alongside our youth leaders to facilitate transitions, assist with personal needs, and encourage the student''s engagement with the message and their peers.

## Flexible Participation Options

Recognizing that a full evening of programming may be overstimulating or difficult without a dedicated aid, we offer a "Partial Participation" model. Families may choose to have their son or daughter attend specific segments of the night that best align with their interests and comfort levels:

- **Hang Time (7-8:10pm)** — free roaming social interaction, games, and food. Needed aide level: **High**.
- **Worship (8:10-8:40pm)** — worship without chairs, darker with more stage lights to create an environment of personal worship and prayer. Needed aide level: **Low**.
- **The Word (8:40-9:05pm)** — teaching, scripture reading, and large-group lesson, similar to Sunday teaching. Needed aide level: **Low**.
- **Group Time (9:05-9:30pm)** — small group discussion setting; intimate conversations, correction moments, deeper discussion. Needed aide level: **Medium**.

## Communication and Coordination

To provide the best care, families coordinating a "Partial Participation" schedule or bringing an external aid should communicate with the Youth Ministry Director **at least 48 hours before** the scheduled event. This allows our team to prepare the environment and ensure a smooth welcome for the student.', 7
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'special-needs-at-transform-youth');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'sunday-team-serving-policy-for-minors', 'Sunday Team Serving Policy for Minors', 'Safety guardrails for minors serving on Sunday teams, including the Red/Yellow/Green team classification framework and open planning questions being worked through.', '## Mission and Heart for Mobilization

At Transform Church, we believe that young people are not just the future of the church, but they are the church today. We are deeply committed to providing safe, empowering, and life-giving environments where students can discover their spiritual gifts and serve the Body of Christ. By mobilizing minors to serve on Sunday teams, we foster spiritual maturity, leadership ownership, and deep-rooted community connection.

## Purpose of Policy

To honor our unwavering commitment to child safety and structural integrity, this policy defines the operational guardrails for minors serving across Sunday ministry teams. Because certain serving environments are less public, or contain adults who have not undergone formal background screening, these guidelines establish necessary oversight frameworks. Our primary goal is ensuring no student is placed in a vulnerable or unmonitored environment, while still optimizing their opportunities to lead.

## Standard Oversight Guidelines

The following safety benchmarks must be upheld at all times, across all Sunday environments:
- **Out-in-the-Open Serving** — minors are highly encouraged to serve in high-visibility, public environments where interactions naturally remain open and accountable.
- **The Two-Adult Rule & Oversight** — no minor may be left alone or unmonitored with an adult who is not background checked. Every minor serving must do so within direct line of sight of a parent/guardian or an officially background-checked Transform Youth representative.
- **Incident Reporting** — any safety concerns, behavioral irregularities, or deviations from these guidelines must be immediately reported directly to the Sunday Service Coordinator or Youth Ministry Director.

## Team Classifications & Eligibility

Sunday serving environments are categorized into a Red, Yellow, and Green framework based on their physical setting and screening levels:

- **GREEN — Transform Kids**: approved at all times. Because 100% of serving adults in this environment are fully vetted and background-checked, minors can serve freely under standard room leadership.
- **YELLOW — Connect Team, Host Team**: approved with youth representation. These roles are out in the open but may include un-screened volunteers — minors must serve in direct proximity to a parent/guardian or a background-checked youth representative.
- **RED — Production, Stage Manager, Hospitality, Excellence Team**: restricted area. These behind-the-scenes or restricted-access environments are a no-go for minors unless a parent or legal guardian is serving alongside them for the entire duration.

## Communication and Coordination

Any minor coordinating a serving schedule must secure prior approval from the Youth Ministry Director. Before a student is scheduled on a Yellow or Red team, ministry leads must verify that the required youth representative or guardian is actively scheduled alongside them.

## Open Questions & Planning Notes

The following items were being worked through as this policy was drafted, alongside current thinking and next steps:

- **Who counts as a minor?** Anyone under 18 — with the question of whether different approaches are needed for different age ranges (e.g. a 13-year-old vs. a 17-year-old) to be defined upfront.
- **Minimum age to serve** — a consistent minimum serving age is needed rather than leaving it up to each team; this still needs to be determined.
- **Who can supervise?** At least someone 18+ who has completed the required background check and child-safety training — this should be made explicit in the policy, with consistent language used throughout.
- **What does the "Two-Adult Rule" actually mean?** Whatever the rule is called should match what teams actually do on Sundays — this needs to be clarified so team leaders aren''t left interpreting it.
- **Supervision / line of sight** — a standard is needed that''s safe but realistic for a Sunday environment (broad guidelines, not rigid "rules") — what good supervision looks like still needs to be determined and described simply.
- **Parent permission** — yes, there should be parent/guardian approval before a minor begins serving; how to capture that approval still needs to be determined.
- **Connection to the Child Protection Policy** — this policy should support the existing Child Protection Policy, not replace it; a simple statement connecting the two still needs to be added.
- **If something happens** — team leaders should follow the church''s existing reporting/escalation process; this needs to be clearly pointed out and communicated to teams.
- **Who can pause someone from serving?** There should be a clearly identified person or role who can make that call — still needs to be determined.
- **Exceptions** — exceptions shouldn''t be made informally by individual team leaders; who can approve an exception and how still needs to be determined.
- **Red/restricted areas** — if exceptions are allowed for a minor to serve in a more restricted area, the additional approval and supervision required needs to be clear — still to be determined.
- **Who owns the policy?** One ministry/leadership role should own the policy and keep it updated — who that is still needs to be determined.', 8
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'sunday-team-serving-policy-for-minors');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'private-property-usage-agreement-youth', 'Private Property Usage Agreement (Youth Off-Site Events)', 'The agreement a property owner signs to host a Transform Youth off-site event, covering supervision requirements, background-check guardrails, and liability terms.', '## I. Purpose and Scope

At Transform Church, child safety and structural accountability are foundational pillars of our ministry. This agreement establishes the operational, safety, and liability conditions under which an individual who is not a contracted staff member ("Property Owner") grants permission to Transform Church ("the Church") to utilize their private residence, facility, or land for an officially sanctioned Transform Youth event or gathering.

## II. Operational Integrity & Property Care

The Church commits to maintaining the highest level of care, respect, and supervision during the scheduled event. The Transform Youth leadership team will oversee all programming, student conduct, and logistical details to ensure the property is treated appropriately. The Property Owner acknowledges that the Church will provide designated, background-checked leaders to supervise all youth-related activities on the premises.

## III. Verification of Premises & Background Check Requirements

To align with our zero-tolerance policy regarding unmonitored minor contact and our strict standard oversight guidelines, the Property Owner certifies and agrees to the following structural requirements during the active hours of the event:

**Mandatory Volunteer & Visitor Guardrails**: the Property Owner certifies that no individuals will be present on the occupied premises during the event except for the participating youth and the officially designated, background-checked Transform Youth ministry team. Any other inhabitants, family members, guests, or tenants who have not passed the Church''s background clearance framework must completely vacate the active event zones for the entire duration of the program.

## IV. Legal Disclaimer and Liability Release

By signing the agreement, the Property Owner explicitly acknowledges and agrees to the following legal and risk parameters:
- **Assumption of Risk** — the Property Owner willingly permits the use of their premises and understands that youth ministry activities contain inherent risks of standard wear, tear, or accidental damage.
- **Liability Release & Hold Harmless** — the Property Owner agrees that Transform Church, its trustees, employees, volunteers, and agents shall not be held liable for any physical property damage, loss, or personal injuries occurring on the premises in connection with the youth event, and releases and holds the Church completely harmless from any legal or financial claims arising from use of the property.
- **Insurance Responsibility** — the Property Owner maintains primary homeowner''s or property liability insurance coverage for their location, and acknowledges that the Church does not assume responsibility for structural insurance or property damage claims under this waiver.

## V. Property Information & Event Details

The agreement records the full name of the property owner(s), the physical street address of the property (premises to be cleared), city/state/zip code, date of scheduled event, and active event hours (e.g. 6pm-9pm).

## VI. Binding Affirmation and Execution

By executing the document, the signer certifies they are the lawful owner or authorized occupant of the property listed, confirms the premises will be completely clear of non-background-checked individuals for the duration of the event, and fully accepts the terms of the liability disclaimer.', 9
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'private-property-usage-agreement-youth');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'youth-handbook-mission-structure-growth', 'Youth Team Handbook: Mission, Structure & Team Growth', 'The 2026 Youth Team Handbook''s mission, vision, core values, team structure, crews, Friday-night arrival schedule, and growth track for new members.', '## Mission

To reach, teach, and empower students to live free in Christ and transform their generation.

## Vision

We see a student-led youth ministry that is fresh, real, and powerful — one that has at its heart the great commission to win souls and make disciples of all nations. A ministry that builds next-generational leaders who will go on to impact schools, cities, states, and nations in the name of Jesus Christ. A ministry with a deep culture of faith, family, health, and love, that develops student leaders and empowers them to become all that God has destined for their lives. We are a Youth Ministry that Transforms the World!

## Core Values

1. Jesus First
2. Honor Always
3. Love Boldly
4. Believe Big
5. Have Fun

## Structure

Youth leadership is composed of two main roles that work together to create a welcoming environment and promote student development:

- **Leader** — the leader role''s main responsibility is leading and empowering students to spearhead a revival in their generation. Leaders are held to a higher standard and are expected to attend weekly prayer, meetings, setup, and Leader''s Nights. They are directly responsible for the students in their group. We have adopted the transform model and implemented an assistant leader/group builder role for those who are not leaders yet.
- **Team Member** — the team member role''s main focus is making Fridays happen. They are always teaching and empowering students to take over responsibilities (not tasks), mainly connecting to students and guiding them to be able to run a Youth Night on their own, and participating in group discussions as assistants and group builders.

**Youth Crews**: First Impressions, Hospitality, Entertainment, Communications, Creative & Media, Production, Worship.

## Team Arrivals & Meetings

On Friday nights, all team members are expected to arrive at **5:30pm**. Leaders and students meet in the sanctuary for pre-service prayer, which can be spent reviewing the group discussion document and connecting with God for wisdom over the night.
- **5:50pm** — setup for the night begins.
- **6:15pm** — pre-leaders meeting to review the flow of the night and get last-minute updates.
- **6:30pm** — full Team Rally, where a team member shares a word of encouragement with the rest of the team members and students; it''s important the whole team is here for last-minute updates.

On Tuesdays at **6:00pm**, team members are invited to a weekly video call team meeting, to go over wins and improves from the previous night and what''s coming up. If unable to attend, you''re still expected to be up to date via meeting notes posted in Discord.

## Team Growth Track

If a new person wishes to join the team, there is a process — all current members are encouraged to follow it to continue growing personally and in vision with Transform Church. Existing team members are also encouraged to keep growing as leaders — if interested in becoming a group leader or assistant group leader, the Director will support you in becoming just that. We are here to help every Team Member and Leader become all God has designed them to become.', 10
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'youth-handbook-mission-structure-growth');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'youth-handbook-policies-procedures', 'Youth Team Handbook: Policies & Procedures', 'Youth ministry safety policies covering student access levels, leader ratios, one-on-one communication rules, dress code, bathrooms, security, drug policy, and rides.', '## Student Accessibility

Youth Team members should understand that students are accessible at any given time, and it is their responsibility to monitor and use best practices based on the environment.
- **Direct Access** — people who have direct interactions with minors (conversations, correction moments, team lead). Example: Leaders approved to serve on Youth, Transform Church Staff.
- **Proximity Access** — people permitted to enter the space, but who cannot have direct interactions with minors. Example: Worship team/Security team/adults not on Youth Team but around students on Sundays/Events; during Street Week, any person who occupies the same space and could interact with a student.

## Leader Ratio

To maintain student safety, required leader supervision varies by environment:
- **Offsite Residence**: 1 leader per 10 students
- **Offsite Public Space**: 1:6
- **Conference**: 1:8 (8th-12th grade only)

## 1-on-1 Communication

- Leaders should not be alone with a student of the opposite gender. Students can be alone with their leader in cases where they are visible to other leaders (in the sanctuary with the door open, in a room with windows to see in, etc.).
- Student 1:1 time outside of youth should be in public settings as much as possible.
- Taking students out of the group or during service for 1:1 conversations should only be done for disciplinary purposes or an urgent matter.
- No leader should directly text a student of the opposite gender.
- Phone call conversations should be avoided as much as possible.
- Utilize the Discord chat in the server as much as possible.

## Prayer

Group Leaders and trained Prayer Team members should be the only ones to administer prayer during altar call moments.

## Worship for Students

All students remain in the sanctuary — group rooms and the track are off limits, with limited bathroom use. No students on their phone, standing in groups chatting, or huddled during altar calls — fully embracing a 1:1 moment with the Lord.

## Leader Dress

Clothing should be clean, well-fitting, and free from excessive wear or damage (no rips, stains, or inappropriate logos). Attire should reflect the values of the church while allowing leaders to be approachable and relatable. Avoid sweatpants, form-fitting clothes, and open-toed shoes.

## Student Dress

Clothing that is modest, clean, and appropriate for a church setting: tops that provide full coverage (no low-cut, sheer, or excessively cropped shirts); shorts, skirts, and dresses at least fingertip length when arms are at the sides; pants, jeans, or athletic wear that fits properly (no sagging or overly tight clothing); shoes suitable for activities (closed-toe recommended for games).

## Bathrooms

One stall bathroom, one student in the bathroom at a time. During group times, multiple-stall bathrooms can be opened for students, as they are not going in groups at that time and can be easily monitored by security.

## Security

- Security Team members arrive by **6:15pm**, keeping an eye on those walking in while the team is in team rally.
- Making sure the parent/guardian is not lingering in the foyer after dropping off their child.
- Monitor the foyer during worship, message, and group time.
- If a student leaves before the end time (**9:30pm**), first confirm with the appropriate leader and verify a parent is there to pick them up, unless they drive themselves.
- At the end of the night, walk students to their car and/or clarify the student is going into the correct Uber (checking the app, the driver, car, and license plate match).

## Students with Drugs

No drugs permitted on site whatsoever — no student can have drugs on them at any time. If a student is suspected/confirmed to have drugs, Transform Church reserves the right to search any bags/belongings of the student. Confront, confiscate, alert the parent. If the student refuses to surrender the paraphernalia, the parent is contacted for pick-up, and the student remains with security until the parents arrive.

## Rides (Ubers, Leaders Driving, etc.)

Youth runs on a self-check-in system — students check themselves in, so liability-wise they are permitted to leave at any time. Our policy is to notify parents if a student is dismissing early, and confirm it is permitted — in general, we strongly encourage students to stay until the night concludes. Best practice is to confirm the Uber driver/vehicle is correct before allowing a student to go. Team members should not give rides to students — if a team member drives a student, they are personally liable for anything that may happen.

## Street Week

- Students must be registered by a parent if under the age of 18.
- Liability release is written into all registration forms given to parents to sign up for events.
- Location of street week should be **10 minutes max**, unless it''s on a different day or students can drive themselves.
- Location of street week must be vetted and approved by the formal Transform Church process.', 11
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'youth-handbook-policies-procedures');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'youth-team-commitment-requirements-conduct', 'Youth Team Commitment: Requirements, Expectations & Conduct', 'The 2026 Transform Youth Commitment — team requirements, team and leader expectations, and standards of conduct that youth team members and leaders agree to.', '## Mission

Reach, teach, and empower the next generation to live free in Christ and transform their world.

## Team Requirements

1. Have a personal commitment to Jesus Christ & be baptized.
2. Call Transform Church your home church and be fully planted, attending regularly.
3. Be in agreement with the mission, vision, and culture/core values.
4. Always honor the leadership of Transform Church.
5. Have completed Transform Church''s Thrive & Freedom class, or be on schedule to do so.
6. Be continuously growing in leadership skills.
7. Have a passion to lead and empower students.
8. Maintain a positive and joyful attitude.
9. Demonstrate a teachable spirit.
10. Be committed to faithfully tithing 10% to the house of God.

## Team Expectations

1. **Keep your relationship with Jesus fresh and genuine** — cultivate a lifestyle of prayer, worship, and devotion to God; always be prepared to share what God is speaking to you.
2. **Be present and available to students** — regularly attend Youth with a mindset to help develop a thriving ministry; be known, approachable, friendly, encouraging, and inclusive no matter the event; be an example that boldly carries the culture of Youth.
3. **Communicate effectively** — respond to emails, texts, group notifications, and team/meeting requests in a timely manner; inform the team of absence or tardiness ahead of time; ask fellow team members for assistance or delegate tasks when needed.
4. **Team solidity & consistency** — be present at all meetings & leadership nights designed to equip, train, build, and grow the team; attend RW and 252 Events; treat one another with respect and love always.
5. **Make disciples** — develop meaningful relationships with students; help them discover their purpose and calling.

## Leader Expectations

1. **Student interaction** — actively grow relationships and develop student leaders; do everything short of sin to reach, teach, and empower those appointed to them (e.g. attending sports games, running errands together, phone calls).
2. **Relationship with God** — be prepared to speak and share a word from stage or in team rally; believe in the power of prayer (attend Men''s/Women''s Prayer once a month).
3. **Ministry development** — always look for things to celebrate and improve (wins/improves each night); have an active voice in meetings to lead the way of believing big.
4. **Team ownership** — make Youth a high priority, limiting other commitments if needed; look for new opportunities to grow and develop relationships with students; plan/prepare ahead of time.
5. **Personal development** — take Transform Church College classes; invest time in podcasts/books.

## Team Conduct

- Not actively engaged in a "lifestyle" of sin, and maintain an accountability partner — i.e. getting drunk, drugs, bullying, pride, lying, gossiping, stealing, rebelling, and sexual immorality (such as fornication, adultery, pedophilia, homosexuality, pornography, etc.).
- Limiting interaction with students of the opposite gender — encouraging healthy boundaries to protect the student, yourself, and the ministry, including car rides, 1-on-1 conversations, text conversations, and phone calls.
- Social media is positive and appropriate — accounts must be positive, encouraging, respectful, and handled appropriately; use of a platform should promote modesty (avoiding excessive gym pics, suggestive photos, excessive selfies); no use of a platform to speak negatively about any church, pastor, leader, government official, president, or country; no cursing, trolling, social media debating, or inappropriate images/videos.

In good faith, having prayerfully considered the responsibilities required for the Youth Team, team members commit to serving with integrity, joy, dedication, passion, and prayer for the building and strengthening of the Kingdom of God at Youth.', 12
FROM "wiki_categories" c
WHERE c."slug" = 'kids-youth-policies'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'youth-team-commitment-requirements-conduct');
--> statement-breakpoint
INSERT INTO "wiki_categories" ("slug", "name", "description", "sort_order")
VALUES ('comms-brand', 'Communications & Brand', 'Guidelines for internal email etiquette, email signatures, and a quick reference for who owns which recurring staff responsibilities.', 5)
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'email-response-codes', 'Email Response Codes', 'Transform Church''s NYR email subject-line codes for flagging how quickly a response is needed, and how to format them.', 'The official format for our NYR codes is as follows:

- **NYRQ** — if you''d like a response quick
- **NYRT** — if you''d like a response by the end of today
- **NYRNBD** — if you''d like a response by the end of the next business day
- **NYRBEW** — if you''d like a response by end of week (by Friday)

Only two things to remember:
1. Always put the code first, subject title second.
2. Keep all letters in the code together.', 0
FROM "wiki_categories" c
WHERE c."slug" = 'comms-brand'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'email-response-codes');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'email-signature-legal-disclaimer', 'Email Signature Legal Disclaimer', 'The standard legal confidentiality clause staff include in their email signature.', 'The material contained in this email may be confidential, and may also be the subject of copyright and/or privileged information. If you are not the intended recipient, any use, disclosure or copying of this document is prohibited. If you have received this document in error, please advise the sender and delete the document. This email communication does not create or vary any contractual relationship between Transform Church and you. Internet communications are not secure and accordingly Transform Church does not accept any legal liability for the contents of this message. Please note that neither Transform Church nor the sender accepts any responsibility for viruses, and it is your responsibility to scan the email and any attachments.', 1
FROM "wiki_categories" c
WHERE c."slug" = 'comms-brand'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'email-signature-legal-disclaimer');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'how-to-insert-email-signature', 'How to Insert Your Email Signature', 'Step-by-step instructions for adding your email signature image and the legal disclaimer clause to Gmail.', '1. Download your email signature from the folder.
2. Go to your Gmail settings and find your signature.
3. Add in your email signature image, and format the image to large — it will automatically add it at its original size, so you''ll need to click on it and change the sizing.
4. Once this is done, press "enter" to go to a new line.
5. Copy the legal clause (see "Email Signature Legal Disclaimer" in this category), highlight it, choose "sans serif" as the font type, and "small" as the font size.
6. Now you are good to go!

If you have any questions, contact Sarah Oliveira: sarah.o@transformchurch.com.', 2
FROM "wiki_categories" c
WHERE c."slug" = 'comms-brand'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'how-to-insert-email-signature');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'who-is-over-what', 'Who Is Over What', 'A quick reference for who owns Team Night, Team Night Hospitality, Connect Email, Guest Relations, Staff Birthdays, Staff Activities & Meals, and Child Dedications.', '- **Team Night** — Sherilyn (notifying directors, making sure registration is created)
- **Team Night Hospitality** — Ed Diomede
- **Connect Email** — Nicole
- **Guest Relations** — Nicole
- **Staff Birthdays** — Lauren Santos
- **Staff Activities & Meals** — Nicole
- **Child Dedications** — Service Coordinator Department (reports into Sherilyn)', 3
FROM "wiki_categories" c
WHERE c."slug" = 'comms-brand'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'who-is-over-what');
--> statement-breakpoint
INSERT INTO "wiki_categories" ("slug", "name", "description", "sort_order")
VALUES ('trainings-best-practices', 'Trainings & Best Practices', 'Practical how-to guidance for running meetings, doing research, planning ministry events, and accessing staff counseling.', 6)
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'meeting-scheduling-preparation-best-practices', 'Meeting Scheduling & Preparation Best Practices', 'Six best practices for scheduling and preparing for meetings so they honor everyone''s time and stay productive.', 'To honor everyone''s time and make meetings more productive, please follow these best practices:

- **Include Transition Time** — when scheduling meetings, consider the time people need to wrap up and move between meetings.
- **Start with a Hard Stop** — begin the meeting by confirming the hard stop time. Unless stated otherwise, assume the calendar end time is the hard stop.
- **Communicate Availability** — if you can''t stay for the full meeting, let the organizer know in advance.
- **Be On Time and Prepared** — arrive on time, ready to contribute for the meeting start time. If it requires setup, arrive early — preparation shows respect for the team and the meeting''s purpose.
- **Send an Agenda in Advance** — share a clear agenda before the meeting, linked directly in the calendar invite so attendees can review ahead of time.
- **Book a Room and Add Purpose** — reserve a meeting room in the calendar invite and include a short description outlining the purpose or goal of the meeting.', 0
FROM "wiki_categories" c
WHERE c."slug" = 'trainings-best-practices'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'meeting-scheduling-preparation-best-practices');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'meeting-agenda-best-practices', 'Meeting Agenda Best Practices', 'What to include on a meeting agenda, how to come prepared as an attendee, and prompts for guiding a decision-making meeting.', '## Building the Agenda

1. Date on the agenda.
2. Be clear on who is running the meeting.
3. If two people are contributing, first skim over what each person needs to keep track of on time.
4. Have time running (a timer or clock).
5. Recap what was discussed last time or what was covered (quick bullets).
6. Have it written out on a document, or use Monday docs — store old agendas where you can both add to them.
7. Have the agenda printed or shared ahead of time.
8. Have any supporting documents sent ahead of time.
9. Consider whether some information is best presented visually — a form, a chart, etc.

## Coming Prepared (If You Don''t Lead the Meeting)

- See an agenda — ask how you can come prepared.
- Be ready to report out on any topics.
- Don''t be distracted.
- Be on time.
- Bring materials needed.

## Prompts for Leading a Decision-Making Meeting

1. "We are discussing [insert topic] because [insert relevance]."
2. Here is what we did last year.
3. Here are the wins and improves from last year.
4. Here are the numbers from last year.
5. Based on that, here is what I am recommending we do this year.
6. Here are the financial implications for this year or our budget.
7. What are your thoughts? Are we good on this plan?
8. Decide on the plan.
9. Recap the decisions made verbally.
10. Let them know the "no turning back" point: "We can all sit on this. At this point, we should choose to stick to this."
11. Action next steps.
12. Record notes somewhere of "why we decided."', 1
FROM "wiki_categories" c
WHERE c."slug" = 'trainings-best-practices'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'meeting-agenda-best-practices');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'how-to-research', 'How to Research', 'Best practices and steps for doing effective research at Transform Church, including search techniques, who to ask, and how to present findings.', '## Best Practices

- Present in a format that is easily readable.
- You are the expert — anticipate questions asked ahead of time, have a Plan A and a Plan B, and provide information while always sharing your preference with why/why not.

## Places to Go to Research

1. **General Google search**
   - Never type questions into Google — use keywords (e.g. "national anthem length" instead of "what is the name of the national anthem and how long").
   - Order of words matters (e.g. "sky blue" versus "blue sky").
   - Use quotation marks to narrow a search to results including only words with that exact phrase.
   - Use the minus sign to exclude a term (e.g. "lions vs. lions -detroit").
   - Use the news filter in Google News for the past hour, week, day, or year.
2. **Wikipedia** — do not use the info directly, but use the sources listed at the bottom (click through the citations).
3. **Reddit reviews**

## Steps

1. Ask if anyone knows of something that has already been tested or tried:
   - Ask other churches — True North (extremely good at processes), Belonging Co (solid resource for anything), Wave Church, Reverb Church (solid processes), Awaken (multi-site campus).
   - Ask department heads or church folks in that area of specialty.
   - Ask staff if they know of anything from other places they worked.
2. Research for yourself to know what you''re looking for — as you learn what''s out there, refine your search with better keywords. This is the initial exploring that likely no one besides you will see.
3. Once you find viable options:
   - Call them to learn firsthand, if possible, and ask all the questions you can.
   - Put the findings in a presentable format (Google Slides, Word doc, or Excel doc).
   - Common items to cover: name, hyperlink, general overview, comparison of what each option has (if appropriate), and price.
   - Give your recommendation of which one to go with.', 2
FROM "wiki_categories" c
WHERE c."slug" = 'trainings-best-practices'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'how-to-research');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'event-planning-template-steps', 'Event Planning Template & Steps', 'The required steps and questions to work through when planning a ministry or department event, from calendar approval to final logistics.', '**Purpose**: this template should give someone who has never heard about your event a complete picture of how it will work. Provide specific details rather than one-word answers — if something doesn''t apply, write N/A.

## Steps

1. Send dates to the Events Director & Operations Director to ensure cohesion with the church calendar.
2. Complete this template and bring it to your oversight for review, including financial cost.
3. Once reviewed, meet with the Operations Director & Finance Director together to review the document and collaborate on event operations, legal considerations (if applicable), and the planning process.
4. Add the event to the church calendar.
5. Notify staff via email of the event (event name, date, time, brief description), who is hosting, and whether their collaboration is needed (case by case).
6. Communicate final logistics to your team.

## Event Overview Questions

- Name of event, date, timeframe (start and end), and location/room(s).
- Describe the event: what are you looking to achieve, and what would make you consider it successful? Why is this event the best way to accomplish that goal?
- Ministry/Department host and lead on the event.
- Expected attendance — is there a cap?
- Audience — whole church (adults and kids), or adults only?

## Event Schedule & Logistics

- Event schedule — what time will each element happen, with a brief description of each.
- When would setup happen (day and timeframe)? When would teardown happen?
- Does anything need to be left in the building afterward — if so, what and where?
- Would you need to displace any groups, etc., for this event?

## Registration & Communication

- Will you need a registration page? What ticket types, prices, and capacity per type?
- How will you market this event, internally and externally?
- What language/blurb will you use to communicate publicly — did you collaborate with Comms?
- Will there be a flyer or printed materials, approved by Comms?
- Will signage be needed — where, and who will create it?

## Teams, Partners & Financial

- Would you need other teams — who, and for what?
- Are you partnering with an organization or talent — who?
- What is the event budget, and how much would you need per month?
- Are you planning to obtain sponsorships — who are you targeting, what are you hoping to receive, and what is your approach plan?
- Will there be an offering at the event? Are you accepting monetary donations as additional event income? How will donations be collected start to finish? Are you accepting cash, Zelle, gift cards, etc.?

## Parking, Safety & Final Considerations

- Parking information, and how you''ll ensure safety at the event.
- What is the ratio of youth to adult, if this is an event for minors?
- Is there anything unique about this event, or anything planned, that Operations or Finance should know about that isn''t captured above?

See the "Event Approval, Sponsorship & Budget Guidelines" article in this category for when approval is required and how sponsorships and event budgets are handled.', 3
FROM "wiki_categories" c
WHERE c."slug" = 'trainings-best-practices'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'event-planning-template-steps');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'event-approval-sponsorship-budget-guidelines', 'Event Approval, Sponsorship & Budget Guidelines', 'When ministry events require Operations approval, how to pursue and use sponsorships properly, and how event budgets and event-generated income are approved.', '## General Guidelines: What Qualifies?

Ministries have full autonomy to lead and make decisions within their area. Operations does not determine the ministry decision, but is responsible for evaluating how that decision impacts the broader church and determining what systems, processes, safeguards, communication, and policies need to be in place to support it successfully. This is an ongoing partnership, not a one-time conversation — as plans develop, details change, or new considerations arise, there may be continued back-and-forth with Operations.

Any planned activity outside of a department or ministry''s normal, recurring operations must be submitted for approval before it is announced, scheduled, promoted, or committed to. Approval is required when any of the following are true:
- People are being invited to attend or participate in something outside the normal weekly ministry/service experience.
- A new or one-time activity, gathering, outing, trip, experience, or activation is being planned.
- Church facilities or spaces are being used differently than their normal scheduled use.
- Church funds will be spent or collected specifically for the activity.
- Registration, tickets, sign-ups, waivers, or RSVPs are needed.
- Food, vendors, rentals, entertainment, transportation, or outside organizations/individuals are involved.
- Church-wide or public promotion is needed.
- Staff or Serve Teams are being asked to support something outside their normal responsibilities.
- The activity involves minors outside the normal Kids/Youth programming structure.
- The activity creates additional operational, safety, security, facilities, production, or communication needs.
- The activity is being held off-site on behalf of Transform Church.
- There is an outside guest invited to come and speak or perform.

## Sponsorships

Sponsorships can be a great way to support an event, but because you are approaching individuals or organizations on behalf of Transform Church, all sponsorship plans must first be discussed with **Finance and Operations before reaching out to any potential sponsors**.

**Choosing sponsors**: potential sponsors should be individuals, businesses, or organizations that align with and uphold Transform Church''s Christian values. Consider not only what a sponsor is willing to give, but whether it''s appropriate for Transform Church to publicly associate with or promote that sponsor.

**Before contacting a sponsor**: connect with Finance and Operations about who you''re considering approaching, to avoid approaching the same individual/business/organization multiple times for different church initiatives. Do not make commitments to a potential sponsor before this conversation.

**Sponsorship communication**: sponsorship requests should use a formal Transform Church sponsorship letter reviewed by Communications. Materials sent to a potential sponsor should clearly and accurately represent Transform Church, the event, what is being requested, and what the sponsorship will support. Do not independently create or send sponsorship materials without review.

**Using sponsorship funds**: be clear with sponsors about what their contribution will support, and use funds for the stated purpose.

**Monetary sponsorships**: should be given through the formal Transform Church giving platform. Finance establishes the appropriate giving option/link and ensures the contribution is properly recorded in Planning Center, associated with the appropriate donor and purpose. Do not independently collect sponsorship funds through personal payment methods or accounts.

**In-kind sponsorships**: when a sponsor provides goods or services rather than money, all in-kind donations should be communicated to Finance, who will advise on the appropriate receipt/documentation.

Remember: before asking anyone for a sponsorship, go to Finance + Operations first.

## Event Budget & Income

Every event is required to have a clear budget before moving forward — showing not only what you plan to spend, but when you expect to spend it, so Finance can plan accordingly.

**Event budget**: submit the total budget, include major anticipated expenses, identify when funds will be needed/spent (including expected month), and keep expenses within the established budget.

**Using income from your event**: if your event is expected to bring in income through registration, donations, sponsorships, merchandise, or another source, do not automatically assume that income can be added to or used toward your event budget. Any request to use event-generated income must be reviewed and approved by **Pastor Katie**, and approval must always include a specific dollar amount that may be used — it should never be open-ended. For example, if an event generates $10,000 but only $3,000 of event income has been approved for use, $3,000 is the amount available, regardless of how much additional income the event generates.

Your event budget should clearly answer two questions: how much are we planning to spend, and when are we planning to spend it? Any event income you want to use is separate, and requires a specific approved amount before it is added to what is available for the event.', 4
FROM "wiki_categories" c
WHERE c."slug" = 'trainings-best-practices'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'event-approval-sponsorship-budget-guidelines');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'counseling-with-ps-gerard', 'Counseling with Pastor Gerard', 'How Transform Church staff can set up counseling sessions with Pastor Gerard, including the annual session limit.', 'To set up your first session with Pastor Gerard, email him directly (**rbc161@gmail.com**) and cc **Ps Katie** just on the first email, so that Ps Gerard knows you are a Church Alive staff member.

Following that, Ps Gerard will set up a **Light the Way** portal for you. You will then fill out the intake forms on the portal, and Ps Gerard will set up an appointment with you.

You have **5 sessions allowed per year**, which do not roll over to the next year.

Please let us know if you have any questions!', 5
FROM "wiki_categories" c
WHERE c."slug" = 'trainings-best-practices'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'counseling-with-ps-gerard');
--> statement-breakpoint
INSERT INTO "wiki_categories" ("slug", "name", "description", "sort_order")
VALUES ('requests-forms', 'Requests & Forms Directory', 'A quick-reference directory of every request category and form in the Request Hub, with what each one is for and when to use it.', 7)
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'requests-facilities', 'Facilities Requests', 'Maintenance, damage reports, room bookings, transportation, and kitchen requests — open any of these forms from the Request Hub.', 'These requests live in the **Facilities Requests** category of the Request Hub. Open the Request Hub from the sidebar to submit any of these forms directly.

### Maintenance & Repair Request
Building-related repairs, upkeep, or a change to a room. Submit at least 2 weeks ahead when you can.

Use this when something needs fixing from normal wear, like a flickering light, a sticky lock, or a leaky faucet.

[Open form →](https://wkf.ms/45vA1rc)

### Facilities Damage Report
Report damage to property, equipment, or a space, with location, severity, and photos.

Use this when something broke or was damaged suddenly, like an accident, a storm, or a break-in.

[Open form →](https://wkf.ms/4jhAVhv)

### Room & Space Booking
Book a room, request setup, food, or AV support for a meeting or event.

Use this when you need a space reserved, at either location.

[Open form →](https://forms.monday.com/forms/d1c111ec3c4976c3b8cb6a20bee3a5b5?r=use1)

### Transportation Request
Move equipment, supplies, or materials between Transform Church and The Williams Center. Submit 3 weeks ahead.

Use this when something needs to physically travel between locations for an event.

[Open form →](https://wkf.ms/4fuz6vA)

### Kitchen Request
New supplies, restocks, or equipment concerns for the staff kitchen.

Use this when the staff kitchen is low on something or needs attention.

[Open form →](https://wkf.ms/47ptte1)', 0
FROM "wiki_categories" c
WHERE c."slug" = 'requests-forms'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'requests-facilities');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'requests-building-it', 'Building / IT Requests', 'IT issues, upgrades, and new equipment requests for the office or team.', 'This request lives in the **Building / IT Requests** category of the Request Hub. Open the Request Hub from the sidebar to submit it directly.

### IT Issues or Requests
IT issues, requests for upgrades, or new items needed for the office or team.

[Open form →](https://forms.monday.com/forms/b8f86278529d1423f2a3c9fd98a3f9b4?r=use1)', 1
FROM "wiki_categories" c
WHERE c."slug" = 'requests-forms'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'requests-building-it');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'requests-comms', 'Comms Requests', 'The Comms Requests category exists in the Request Hub for communication, promotion, design, and messaging requests.', 'The **Comms Requests** category is set up in the Request Hub for communication, promotion, design, and messaging requests. No form has been published to it yet — check the Request Hub directly, or ask your Comms team lead how to route a request in the meantime.', 2
FROM "wiki_categories" c
WHERE c."slug" = 'requests-forms'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'requests-comms');
--> statement-breakpoint
INSERT INTO "wiki_articles" ("category_id", "slug", "title", "summary", "content", "sort_order")
SELECT c."id", 'requests-production', 'Production Requests', 'The Production Requests category exists in the Request Hub for audio, video, lighting, staging, and production support.', 'The **Production Requests** category is set up in the Request Hub for audio, video, lighting, staging, and production support. No form has been published to it yet — check the Request Hub directly, or ask your Production team lead how to route a request in the meantime.', 3
FROM "wiki_categories" c
WHERE c."slug" = 'requests-forms'
  AND NOT EXISTS (SELECT 1 FROM "wiki_articles" a WHERE a."slug" = 'requests-production');
