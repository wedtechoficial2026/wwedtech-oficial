<?php
// logout.php - Encerra a sessão e redireciona para login
require_once __DIR__ . '/auth.php';
logout();
header('Location: login.php?msg=desconectado');
exit;
