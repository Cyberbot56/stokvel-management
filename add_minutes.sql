CREATE TABLE meeting_minutes (
  minutesId   INT IDENTITY(1,1) PRIMARY KEY,
  FKmeetingId INT NOT NULL,
  content     NVARCHAR(MAX) NOT NULL,
  uploadedBy  INT NOT NULL,
  uploadedAt  DATETIME DEFAULT GETDATE(),
  FOREIGN KEY (FKmeetingId) REFERENCES meetings(meetingsId),
  FOREIGN KEY (uploadedBy)  REFERENCES users(userId)
);