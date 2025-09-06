import pkg from 'pg';
const { Client } = pkg;

import { sql } from '@vercel/postgres';
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  User,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';

import { unstable_noStore as noStore } from 'next/cache'; //To prevent caching


export async function fetchRevenue() {
  // Add noStore() here to prevent the response from being cached.
  // This is equivalent to in fetch(..., {cache: 'no-store'}).
  // Or use
  //  export const dynamic = "force-dynamic"
  //noStore();
  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      user: process.env.POSTGRES_USER,
      host: process.env.POSTGRES_HOST,
      database: process.env.POSTGRES_DATABASE,
      password: process.env.POSTGRES_PASSWORD,
      port: Number(process.env.POSTGRES_PORT),
    });
    await client.connect();

    //Delay a response for demo purposes
    //console.log("Fetching revenue data...");
    //await new Promise((resolve) => setTimeout(resolve, 10000));

    const result = await client.query('select * from revenue');
    //console.log(result.rows);
    //console.log('Data fetch completed after 3 seconds.');
    await client.end();

    return result.rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

export async function fetchLatestInvoices() {
  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      user: process.env.POSTGRES_USER,
      host: process.env.POSTGRES_HOST,
      database: process.env.POSTGRES_DATABASE,
      password: process.env.POSTGRES_PASSWORD,
      port: Number(process.env.POSTGRES_PORT),
    });
    await client.connect();
    const result = await client.query(`
    select i.amount, c.name, c.image_url, c.email, i.id
      from invoices i, customers c
      where i.customer_id = c.id
      order by i.date desc
      limit 5
      `);
    //console.log(result.rows);
    await client.end();

    const latestInvoices = result.rows.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      user: process.env.POSTGRES_USER,
      host: process.env.POSTGRES_HOST,
      database: process.env.POSTGRES_DATABASE,
      password: process.env.POSTGRES_PASSWORD,
      port: Number(process.env.POSTGRES_PORT),
    });
    await client.connect();
    const invoiceCountPromise = await client.query(`select count(*) from invoices`);
    const customerCountPromise = await client.query(`select count(*) from customers`);
    const invoiceStatusPromise = await client.query(`
      select
         sum(case when status = 'paid' then amount else 0 end) as "paid",
         sum(case when status = 'pending' then amount else 0 end) as "pending"
         from invoices`);
    //console.log(invoiceStatusPromise.rows);
    //Output: [ { paid: '948128', pending: '1005056' } ]
    await client.end();

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(data[0].rows[0].count ?? '0');
    const numberOfCustomers = Number(data[1].rows[0].count ?? '0');
    const totalPaidInvoices = formatCurrency(data[2].rows[0].paid ?? '0');
    const totalPendingInvoices = formatCurrency(data[2].rows[0].pending ?? '0');

    //console.log (numberOfCustomers,numberOfInvoices,totalPaidInvoices,totalPendingInvoices)
    //Output: 10 120 $9,481.28 $10,050.56
    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  query = '%' + query + '%';

  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      user: process.env.POSTGRES_USER,
      host: process.env.POSTGRES_HOST,
      database: process.env.POSTGRES_DATABASE,
      password: process.env.POSTGRES_PASSWORD,
      port: Number(process.env.POSTGRES_PORT),
    });
    await client.connect();
    const invoices = await client.query(`
      select
       i.id,
       i.amount,
       i.date,
       i.status,
       c.name,
       c.email,
       c.image_url
      from invoices i, customers c
      where i.customer_id = c.id
      and (c.name ilike $1
      or c.email ilike $1
      or i.amount::text ilike $1
      or i.date::text ilike $1
      or i.status ilike $1)
      order by i.date desc
      limit $2 offset $3`,[query, ITEMS_PER_PAGE, offset]);
    await client.end();

    return invoices.rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string) {
  query = '%' + query + '%';
  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      user: process.env.POSTGRES_USER,
      host: process.env.POSTGRES_HOST,
      database: process.env.POSTGRES_DATABASE,
      password: process.env.POSTGRES_PASSWORD,
      port: Number(process.env.POSTGRES_PORT),
    });
    await client.connect();
    const count = await client.query(`
      select count(*)
      from invoices i, customers c
      where i.customer_id = c.id
      and (c.name ilike $1
      or c.email ilike $1
      or i.amount::text ilike $1
      or i.date::text ilike $1
      or i.status ilike $1)`,[query]);
    await client.end();

    //console.log("count(*)=",count.rows[0].count)

    const totalPages = Math.ceil(Number(count.rows[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      user: process.env.POSTGRES_USER,
      host: process.env.POSTGRES_HOST,
      database: process.env.POSTGRES_DATABASE,
      password: process.env.POSTGRES_PASSWORD,
      port: Number(process.env.POSTGRES_PORT),
    });
    await client.connect();
    const data = await client.query(`
      select
        id, customer_id, amount, status
      from invoices
      where id = $1`,[id]);
    await client.end();

    const invoice = data.rows.map((invoice) => ({
      ...invoice,
      // Convert amount from cents to dollars
      amount: invoice.amount / 100,
    }));

    return invoice[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      user: process.env.POSTGRES_USER,
      host: process.env.POSTGRES_HOST,
      database: process.env.POSTGRES_DATABASE,
      password: process.env.POSTGRES_PASSWORD,
      port: Number(process.env.POSTGRES_PORT),
    });
    await client.connect();
    const data = await client.query(`
      select id, name
      from customers
      order by name asc`);
    await client.end();

    const customers = data.rows;
    //console.log("customers:",customers)
    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const data = await sql<CustomersTableType>`
                SELECT
                  customers.id,
                  customers.name,
                  customers.email,
                  customers.image_url,
                  COUNT(invoices.id) AS total_invoices,
                  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
                  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
                FROM customers
                LEFT JOIN invoices ON customers.id = invoices.customer_id
                WHERE
                  customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
                GROUP BY customers.id, customers.name, customers.email, customers.image_url
                ORDER BY customers.name ASC
          `;

    const customers = data.rows.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}

export async function getUser(email: string) {
  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      user: process.env.POSTGRES_USER,
      host: process.env.POSTGRES_HOST,
      database: process.env.POSTGRES_DATABASE,
      password: process.env.POSTGRES_PASSWORD,
      port: Number(process.env.POSTGRES_PORT),
    });
    await client.connect();
    const result = await client.query('select * from users where email = $1',[email]);
    console.log("result.rows[0]:",result.rows[0]);
    await client.end();
    //const user = await sql`SELECT * FROM users WHERE email=${email}`;
    return result.rows[0] as User;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to fetch user.');
  }
}
