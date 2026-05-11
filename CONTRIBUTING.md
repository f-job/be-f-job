# Contributing to Express TypeScript Boilerplate

First off, thank you for considering contributing to this project! 🎉

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Running Tests](#running-tests)

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. By participating, you are expected to uphold this code.

### Our Standards

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

## Getting Started

1. Fork the repository
2. Clone your fork:
```bash
git clone https://github.com/mzubair481/express-boilerplate.git
```
3. Create a new branch:
```bash
git checkout -b feature/your-feature-name
```
4. Set up development environment:
```bash
npm install
cp .env.example .env
```

## Development Process

1. Create a feature branch from `main`
2. Make your changes
3. Write or update tests
4. Update documentation
5. Submit a pull request

### Branch Naming Convention

- Feature: `feature/your-feature-name`
- Bug fix: `fix/issue-description`
- Documentation: `docs/what-you-documented`
- Performance: `perf/what-you-optimized`

## Pull Request Process

1. Update the README.md with details of changes if applicable
2. Update the documentation
3. Add tests for new functionality
4. Ensure the test suite passes
5. Update the CHANGELOG.md
6. The PR must be reviewed by at least one maintainer

### PR Title Format

```
type(scope): description

Examples:
feat(auth): add refresh token functionality
fix(database): resolve connection pooling issue
docs(readme): update deployment instructions
```

## Coding Standards

### TypeScript

- Use TypeScript's strict mode
- Properly type all functions and variables
- Use interfaces over types when possible
- Document complex functions with JSDoc comments

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas in objects and arrays
- Use meaningful variable names
- Keep functions small and focused
- Use async/await over raw promises

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

## Running Tests

Before submitting a PR, ensure all tests pass:

```bash
# Run all tests
npm test

# Run E2E tests
npm run test:e2e

# Check test coverage
npm run test:coverage
```

## Questions or Problems?

- Open an issue for bugs
- Use discussions for questions
- Tag maintainers for urgent issues

Thank you for contributing! 🚀
