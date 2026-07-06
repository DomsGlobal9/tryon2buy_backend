# Use an official Node runtime as a parent image (slim for smaller size)
FROM node:22-slim

# Install OpenSSL (required by Prisma) and other basic dependencies
RUN apt-get update -y && apt-get install -y openssl

# Set the working directory to /app
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose the ports for both internal and external servers
EXPOSE 4000
EXPOSE 4001

# Default command (will be overridden by docker-compose)
CMD ["npm", "start"]
