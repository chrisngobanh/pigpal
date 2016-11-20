const axios = require('axios');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const express = require('express');
const mongoose = require('mongoose');
const nunjucks = require('nunjucks');
const session = require('express-session');

const app = express();


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static('public'));

const MongoStore = require('connect-mongo')(session);

const db = mongoose.createConnection();

// Initialize Connection to MongoDB
db.open('127.0.0.1', 'piggybank', 27017, {});


db.once('open', () => {
  console.log('Connection to DB established');
});

const sess = {
  secret: 'https://www.youtube.com/watch?v=fYpYlbX8MhY',
  store: new MongoStore({ mongooseConnection: db }),
  resave: false,
  saveUninitialized: true,
  cookie: {},
};

app.use(session(sess));

const env = new nunjucks.Environment(
              new nunjucks.FileSystemLoader('views'),
              { autoescape: false }
            );

env.express(app);



/*

  DB Stuff

 */


const UserSchema = mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  customerId: { type: String, default: '' },
  goal: {
    name: { type: String, default: '' },
    amount: { type: Number },
    type: { type: String },
    progress: { type: Number },
  },
  // authorizedAccounts: { type: [String], default: [] },
});

const AccountSchema = mongoose.Schema({
  accountId: { type: String, required: true },
  savingsAccountId: { type: String, required: true },
  customerId: { type: String, required: true },
  maxChange: { type: Number, default: 1 },
  savedChange: { type: Number, default: 0 },
});

const TransferSchema = mongoose.Schema({
  accountId: { type: String, required: true },
  savingsAccountId: { type: String, required: true },
  // customerId: { type: String, required: true },
  purchaseId: { type: String, required: true},
  transferId: { type: String, required: true},
});

const UserMongoModel = db.model('users', UserSchema);
const AccountMongoModel = db.model('accounts', AccountSchema);
const TransferMongoModel = db.model('transfers', TransferSchema);

app.all('*', (req, res, next) => {
  if (req.session.user) {
    const { email } = req.session.user;
    UserMongoModel.findOne({ email }, (err, user) => {
      req.session.user = { email: user.email, customerId: user.customerId, goal: user.goal };
      next();
    });
  } else {
    next();
  }
});

app.get('/', (req, res) => {
  if (!req.session.user) {
    res.render('home.html');
  } else {
    res.redirect('/overview');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  })
});

app.get('/login', (req, res) => {
  if (!req.session.user) {
    res.render('login.html');
  } else {
    res.redirect('/overview');
  }
});

app.get('/shop', (req, res) => {
  const { customerId } = req.session.user;
  axios.get(`http://api.reimaginebanking.com/customers/${customerId}/accounts?key=53f6f974370f881469bf44fea1738127`)
    .then(({ data }) => {
      console.log(data)
      res.render('shop.html', { accounts: data });
    });
});

app.post('/purchase', (req, res) => {
  const { customerId } = req.session.user;
  const { animal, payment } = req.body;
  let amount = 0;
  if (animal === 'Bunny') {
    amount = 19.85;
  } else if (animal === 'Chinchilla') {
    amount = 17.38;
  } else if (animal === 'Snek') {
    amount = 11.03;
  } else if (animal === 'Doggo') {
    amount = 40.72
  }

  axios.post(`http://api.reimaginebanking.com/accounts/${payment}/purchases?key=53f6f974370f881469bf44fea1738127`, {
    amount,
    merchant_id: '582803ea360f81f10454a8f0',
    medium: 'balance',
    description: `Rachel's Pet Shop -- ${animal}`,
  })
    .then(({ data }) => {
      res.redirect('/shop');
    })
    .catch((err) => {

    });
});

app.get('/overview', (req, res) => {
  if (req.session.user) {
    const { customerId, goal } = req.session.user;
    AccountMongoModel.find({ customerId }, (err, accounts) => {
      axios.get(`http://api.reimaginebanking.com/customers/${customerId}/accounts?key=53f6f974370f881469bf44fea1738127`)
        .then(({ data }) => {
          let totalSavedChange = 0;

          const authorizedAccounts = accounts.map((account) => {
            totalSavedChange += account.savedChange;
            for (let i = 0; i < data.length; i++) {
              if (account.accountId === data[i]._id) {
                return data[i];
              }
            }
          });

          console.log(goal)
          totalSavedChange = totalSavedChange.toFixed(2);
          res.render('profile.html', { authorizedAccounts, totalSavedChange, goal });
          // res.render('overview.html', { authorizedAccounts, totalSavedChange, goal, moreAccounts: data });
        });
    });
  } else {
    res.redirect('/');
  }
});

app.get('/settings', (req, res) => {
  if (req.session.user) {
    const { customerId, goal } = req.session.user;
    AccountMongoModel.find({ customerId }, (err, accounts) => {
      axios.get(`http://api.reimaginebanking.com/customers/${customerId}/accounts?key=53f6f974370f881469bf44fea1738127`)
        .then(({ data }) => {
          res.render('settings.html', { moreAccounts: data });
          // res.render('overview.html', { authorizedAccounts, totalSavedChange, goal, moreAccounts: data });
        });
    });
  } else {
    res.redirect('/');
  }
});

app.get('/setgoal', (req, res) => {
  res.render('goal.html');
});

app.get('/goal', (req, res) => {
  const { goal, customerId } = req.session.user;

  axios.get(`http://api.reimaginebanking.com/customers/${customerId}/accounts?key=53f6f974370f881469bf44fea1738127`)
    .then(({ data }) => {
      res.render('newgoal.html', { goal, accounts: data });
    });
});

app.get('/refresh', (req, res) => {
  const { customerId } = req.session.user;
  AccountMongoModel.find({ customerId }, (err, accounts) => {
    refresh(accounts, function() {
      res.redirect('/overview')
    });
  });
});

app.get('/account/:accountId', (req, res) => {
  const { accountId } = req.params;
  AccountMongoModel.findOne({ accountId }, (err, accountData) => {
    let account = JSON.parse(JSON.stringify(accountData));
    let savingsAccount = '';
    let transfers = [];
    account.savedChange = account.savedChange.toFixed(2);
    axios.get(`http://api.reimaginebanking.com/accounts/${accountData.accountId}?key=53f6f974370f881469bf44fea1738127`)
      .then(({ data }) => {
        account.nickname = data.nickname;
        account.type = data.type;
        return axios.get(`http://api.reimaginebanking.com/accounts/${accountData.savingsAccountId}?key=53f6f974370f881469bf44fea1738127`);
      })
      .then(({ data }) => {
        savingsAccount = data;
        return axios.get(`http://api.reimaginebanking.com/accounts/${account.savingsAccountId}/transfers?key=53f6f974370f881469bf44fea1738127`);
      })
      .then(({ data }) => {
        transfers = data;
        return axios.get(`http://api.reimaginebanking.com/accounts/${account.accountId}/purchases?key=53f6f974370f881469bf44fea1738127`);
      })
      .then(({ data }) => {
        TransferMongoModel.find({ accountId, savingsAccountId: account.savingsAccountId }, (err, _transfers) => {
          const purchases = data;
          const transactionHistory = [];

          _transfers.forEach((transfer) => {
            for (let i = 0; i < purchases.length; i++) {
              if (transfer.purchaseId === purchases[i]._id) {
                for (let j = 0; j < transfers.length; j++) {
                  if (transfer.transferId === transfers[j]._id) {
                    transactionHistory.push({ transfer: transfers[j], purchase: purchases[i]});
                    break;
                  }
                }
                break;
              }
            }
          });

          res.render('account.html', { account, savingsAccount, transactionHistory });
        });

      });
  });
});

app.get('/account/:accountId/disconnect', (req, res) => {
  const { accountId } = req.params;
  AccountMongoModel.findOneAndRemove({ accountId }, (err, accountData) => {
    TransferMongoModel.find( { accountId }).remove(() => {
      res.redirect('/overview');
    });
  });
});


app.post('/login', (req, res) => {
  const { email, password } = req.body;

  UserMongoModel.findOne({ email: email.toLowerCase() }, (err, user) => {
    bcrypt.compare(user.password, password, (err, correct) => {
      req.session.user = { email: user.email, customerId: user.customerId, goal: user.goal };

      res.redirect('/overview');
    });
  });
});

app.post('/signup', (req, res) => {
  const { email, password, customerId } = req.body;

  bcrypt.hash(password, 10, (err, hash) => {
    UserMongoModel.create({
      customerId,
      email: email.toLowerCase(),
      password: hash,
    }, (err, user) => {
      req.session.user = { customerId, email: user.email, goal: user.goal };

      res.redirect('/overview');
    });
  })
});

app.post('/addaccount', (req, res) => {
  const { accountId, savingsAccountId } = req.body;
  const { customerId } = req.session.user;

  AccountMongoModel.create({
    accountId,
    savingsAccountId,
    customerId,
  }, (err, account) => {
    axios.get(`http://api.reimaginebanking.com/accounts/${savingsAccountId}/transfers?type=payee&key=53f6f974370f881469bf44fea1738127`)
      .then(({ data }) => {
        res.redirect(`/account/${accountId}`);
      });
    // Redirect to the account page
  });
});

app.post('/creategoal', (req, res) => {
  const { name, amount, type } = req.body;
  const { customerId } = req.session.user;

  console.log(name, amount, type);
  UserMongoModel.findOneAndUpdate({ customerId }, { goal: { name, amount, type, progress: 0 } }, (err, user) => {
    req.session.user.goal = user.goal;
    console.log(user)
    res.redirect('/overview');
  });
});

app.post('/plan/charity', (req, res) => {
  const { customerId } = req.session.user;
  const { charity, account, amount } = req.body;
  console.log(req.body)
  axios.post(`http://api.reimaginebanking.com/accounts/${account}/purchases?key=53f6f974370f881469bf44fea1738127`, {
    amount: parseInt(amount),
    merchant_id: '58282006360f81f10454bcbb',
    medium: 'balance',
    description: `Gracious donation to ${charity}`,
  })
    .then(({ data }) => {
      UserMongoModel.findOneAndUpdate({ customerId }, { goal: { name: '' }}, (err, user) => {
        res.redirect(`/thankyou?charity=${charity}`);
        req.session.user.goal = { name: '' };
      });
    })
    .catch((err) => {
      console.log(err)
    });
});

app.post('/plan/vacation', (req, res) => {
  const { customerId } = req.session.user;
  const { account, amount, flights } = req.body;
  console.log(req.body)
  axios.post(`http://api.reimaginebanking.com/accounts/${account}/purchases?key=53f6f974370f881469bf44fea1738127`, {
    amount: parseInt(amount),
    merchant_id: '58282006360f81f10454bcbb',
    medium: 'balance',
    description: `Plane ticket -- ${flights}`,
  })
    .then(({ data }) => {
      UserMongoModel.findOneAndUpdate({ customerId }, { goal: { name: '' }}, (err, user) => {
        res.redirect(`/confirmticket`);
        req.session.user.goal = { name: '' };
      });
    })
    .catch((err) => {
      console.log(err)
    });
});

app.get('/thankyou', (req, res) => {
  const { charity } = req.query;
  res.render('thankyou.html', { charity });
});

app.get('/confirmticket', (req, res) => {
  res.render('confirmticket.html');
});

app.listen(3000);
console.log('Server listening on 3000.');


// Every 10 mins, check every account's purchase history and do transfers if needed
const delay = 1000 * 60 * 10;

function handleSavingsTransfers() {
  AccountMongoModel.find({}, (err, accounts) => {
    refresh(accounts, function() {

    });
  });
  setTimeout(handleSavingsTransfers, delay);
}

function refresh(accounts, callback) {
  accounts.forEach((account) => {
    let purchases = [];
    let { savedChange } = account;
    let goalProgress = 0;
    axios.get(`http://api.reimaginebanking.com/accounts/${account.accountId}/purchases?key=53f6f974370f881469bf44fea1738127`)
      .then(({ data }) => {
        purchases = data;

        return axios.get(`http://api.reimaginebanking.com/accounts/${account.accountId}/transfers?key=53f6f974370f881469bf44fea1738127`);
      })
      .then(({ data }) => {
        const transfers = data;

        for (let i = purchases.length - 1; i >= 0; i--) {
          let foundTransfer = false;
          for (let j = 0; j < transfers.length; j++) {
            if (transfers[j].description.substr(12) === purchases[i]._id) {
              foundTransfer = true;
              break;
            }
          }

          if (foundTransfer) {
            break;  // Break out because there are no more transfers that need to be made
          } else {
            console.log(purchases[i].amount)
            console.log(Math.round((Math.ceil(purchases[i].amount) - purchases[i].amount) * 100) / 100)
            axios.post(`http://api.reimaginebanking.com/accounts/${account.accountId}/transfers?type=payer&key=53f6f974370f881469bf44fea1738127`, {
              medium: 'balance',
              payee_id: account.savingsAccountId,
              amount: Math.round((Math.ceil(purchases[i].amount) - purchases[i].amount) * 100) / 100,
              description: `Piggybank - ${purchases[i]._id}`,
            })
              .then(({ data }) => {
                savedChange += data.objectCreated.amount;
                goalProgress += data.objectCreated.amount;
                AccountMongoModel.findOneAndUpdate({ accountId: account.accountId }, { savedChange }, (err, _account) => {
                  TransferMongoModel.create({
                    accountId: account.accountId,
                    savingsAccountId: account.savingsAccountId,
                    purchaseId: purchases[i]._id,
                    transferId: data.objectCreated._id,
                  }, () => {
                    UserMongoModel.findOneAndUpdate({ customerId: account.customerId }, { $inc: { 'goal.progress': goalProgress } }, (err, user) => {
                    });
                  });
                });
              }).catch((err) => {
                // console.log(err)
              });
          }
        }
      })
      .catch((err) => {
        console.log(err)
      });
  });
  callback();
}

handleSavingsTransfers();
