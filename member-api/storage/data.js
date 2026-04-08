const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  dialect:  'mssql',
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dialectOptions: {
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
  },
  logging: false,
});

const User         = require('../common/models/User')(sequelize);
const Group        = require('../common/models/Group')(sequelize);
const Member       = require('../common/models/Member')(sequelize);
const Contribution = require('../common/models/Contribution')(sequelize);

User.hasMany(Member);
Member.belongsTo(User);
Group.hasMany(Member);
Member.belongsTo(Group);
Group.hasMany(Contribution);
Contribution.belongsTo(Group);
User.hasMany(Contribution);
Contribution.belongsTo(User);

sequelize.authenticate()
  .then(() => console.log('Connected to Azure SQL'))
  .catch((e) => console.error('Connection failed:', e.message));

module.exports = { sequelize, User, Group, Member, Contribution };