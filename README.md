# Есть идея — GitHub Pages + Supabase

Это статическая версия проекта для GitHub Pages. Node.js/Express и Render не нужны: авторизация, база и защищённые операции выполняются через Supabase.

## 1. Настроить Supabase
1. Создай проект на https://supabase.com.
2. Открой SQL Editor → New query.
3. Вставь весь текст из `supabase_schema.sql` и нажми Run.
4. Открой Project Settings → API. Скопируй Project URL и publishable key (или legacy anon key).
5. Открой `config.js`, вставь URL и ключ вместо примеров. Файл содержит только публичный publishable/anon key.

Не публикуй `service_role` key. Он даёт обход RLS и не должен находиться в браузерном коде.

## 2. Загрузить на GitHub
Загрузи в корень репозитория файлы `index.html`, `style.css`, `app.js`, `config.js`, `supabase_schema.sql`, `README.md`. В GitHub: Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/(root)` → Save.

ПРИМЕЧАНИЕ: если репозиторий публичный, `config.js` будет виден. Это нормально только для Supabase URL + publishable/anon key при корректных RLS-политиках. Не добавляй секретные ключи.

## 3. Включить регистрацию
В Supabase → Authentication → URL Configuration добавь адрес GitHub Pages в Site URL и Redirect URLs. Например `https://USERNAME.github.io/est-ideya/` (замени USERNAME на имя GitHub и название репозитория).

## 4. Назначить модератора
Сначала зарегистрируйся в приложении. Затем в Supabase → SQL Editor выполни запрос, подставив свой email:

```sql
update public.profiles p
set role = 'moderator'
from auth.users u
where p.id = u.id and lower(u.email) = lower('ТВОЙ_EMAIL');
```

Делай это только для доверенного аккаунта. Обычный пользователь не может менять роль через сайт.

## Важно
- Это новая облачная база; существующий `ideas.sqlite` автоматически не переносится.
- В Supabase → Authentication можно отключить подтверждение email для быстрой учебной демонстрации, либо оставить его включённым.
- Перед сдачей проверь регистрацию, вход, создание идеи, голосование, комментарии и модерацию.
