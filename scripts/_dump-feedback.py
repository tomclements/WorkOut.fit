import json, os, sqlite3

paths = [
    r"C:\Users\tomcl\Source\workout-planner\WorkoutPlanner.Api\workoutplanner.db",
    r"C:\Users\tomcl\Source\workout-planner\workoutplanner.db",
]
for p in paths:
    print("FILE", p, "exists", os.path.exists(p), "size", os.path.getsize(p) if os.path.exists(p) else 0)
    if not os.path.exists(p):
        continue
    c = sqlite3.connect(p)
    c.row_factory = sqlite3.Row
    names = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    print(" tables", names)
    if "FeedbackMessages" not in names:
        continue
    print(" count", c.execute("SELECT COUNT(*) FROM FeedbackMessages").fetchone()[0])
    q = """SELECT Id, CreatedAt, Category, Message, ContactEmail, PageUrl, UserEmail, IsRead
           FROM FeedbackMessages ORDER BY datetime(CreatedAt) DESC LIMIT 30"""
    for r in c.execute(q):
        print(json.dumps(dict(r), default=str))
    print("---")
