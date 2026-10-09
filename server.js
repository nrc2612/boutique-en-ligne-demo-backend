require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Erreur : STRIPE_SECRET_KEY manquante dans les variables d\'environnement.');
    process.exit(1);
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();

// ---------- Middlewares ----------

const frontendUrl = process.env.FRONTEND_URL || process.env.FRONT_END_URL;
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    frontendUrl ? new URL(frontendUrl).origin : null,
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // autorise aussi les requêtes sans origin (curl, Postman, même origine)
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        callback(new Error('Origine non autorisée par CORS'));
    },
}));

app.use(express.json());
app.use(express.static(__dirname));

// ---------- Catalogue produits (source de vérité côté serveur) ----------

const products = {
    cloudmax:  { name: 'CloudMax',  description: 'marchez sur des nuages', unit_amount: 23000 },
    airwave:   { name: 'AirWave',   description: 'légère comme l\'air',    unit_amount: 19000 },
    stormgrip: { name: 'StormGrip', description: 'adhérence totale',       unit_amount: 21000 }
};

// ---------- Routes ----------

app.post('/create-checkout-session', async (req, res) => {
    try {
        const items = Array.isArray(req.body.items)
            ? req.body.items
            : [{ productId: req.body.productId, quantity: 1 }];

        if (items.length === 0 || items.some(item => !products[item.productId])) {
            return res.status(400).json({ error: 'Produit inconnu.' });
        }

        if (items.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10)) {
            return res.status(400).json({ error: 'Quantité invalide.' });
        }

        // Base dynamique pour les URLs de retour, sans hardcoder localhost
        const origin = req.headers.origin || req.headers.referer || `http://localhost:${PORT}`;
        const baseUrl = origin.replace(/\/$/, ''); // retire un éventuel slash final

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: items.map(({ productId, quantity }) => {
                const product = products[productId];
                return {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: product.name,
                            description: product.description,
                        },
                        unit_amount: product.unit_amount,
                    },
                    quantity,
                };
            }),
            mode: 'payment',
            success_url: `${baseUrl}/succes.html`,
            cancel_url: `${baseUrl}/cancel.html`,
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error('Erreur Stripe checkout :', error.message);
        res.status(500).json({ error: 'Impossible de créer la session de paiement.' });
    }
});

// 404 générique pour toute route API inconnue
app.use((req, res) => {
    res.status(404).json({ error: 'Route introuvable.' });
});

// ---------- Lancement ----------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});
