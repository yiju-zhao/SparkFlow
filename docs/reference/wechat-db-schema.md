-- DROP SCHEMA wechat_articles;

CREATE SCHEMA wechat_articles AUTHORIZATION root;

-- DROP SEQUENCE wechat_articles.articles_id_seq;

CREATE SEQUENCE wechat_articles.articles_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE wechat_articles.images_id_seq;

CREATE SEQUENCE wechat_articles.images_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE wechat_articles.scrape_progress_id_seq;

CREATE SEQUENCE wechat_articles.scrape_progress_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE wechat_articles.scrape_queue_id_seq;

CREATE SEQUENCE wechat_articles.scrape_queue_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE wechat_articles.sources_id_seq;

CREATE SEQUENCE wechat_articles.sources_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;-- wechat_articles.sources definition

-- Drop table

-- DROP TABLE wechat_articles.sources;

CREATE TABLE wechat_articles.sources (
	id serial4 NOT NULL,
	slug varchar(64) NOT NULL,
	"name" varchar(255) DEFAULT ''::character varying NOT NULL,
	platform varchar(64) DEFAULT 'wechat'::character varying NOT NULL,
	description text DEFAULT ''::text NOT NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT sources_pkey PRIMARY KEY (id),
	CONSTRAINT sources_slug_key UNIQUE (slug)
);


-- wechat_articles.articles definition

-- Drop table

-- DROP TABLE wechat_articles.articles;

CREATE TABLE wechat_articles.articles (
	id serial4 NOT NULL,
	source_id int4 NOT NULL,
	article_hash varchar(32) NOT NULL,
	title varchar(512) DEFAULT ''::character varying NOT NULL,
	author varchar(255) DEFAULT ''::character varying NOT NULL,
	publish_time timestamp NULL,
	original_url text NOT NULL,
	cover_url text DEFAULT ''::text NOT NULL,
	content_html text DEFAULT ''::text NOT NULL,
	content_text text DEFAULT ''::text NOT NULL,
	fetched_at timestamp DEFAULT now() NOT NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT articles_pkey PRIMARY KEY (id),
	CONSTRAINT uq_article_url UNIQUE (original_url),
	CONSTRAINT articles_source_id_fkey FOREIGN KEY (source_id) REFERENCES wechat_articles.sources(id) ON DELETE CASCADE
);
CREATE INDEX idx_articles_hash ON wechat_articles.articles USING btree (article_hash);
CREATE INDEX idx_articles_publish_time ON wechat_articles.articles USING btree (publish_time);
CREATE INDEX idx_articles_source ON wechat_articles.articles USING btree (source_id);


-- wechat_articles.images definition

-- Drop table

-- DROP TABLE wechat_articles.images;

CREATE TABLE wechat_articles.images (
	id serial4 NOT NULL,
	article_id int4 NOT NULL,
	image_type varchar(16) DEFAULT 'content'::character varying NOT NULL,
	image_index int4 DEFAULT 0 NOT NULL,
	original_url text DEFAULT ''::text NOT NULL,
	filename varchar(255) DEFAULT ''::character varying NOT NULL,
	mime_type varchar(64) DEFAULT 'image/jpeg'::character varying NOT NULL,
	"data" bytea NULL,
	file_size int4 DEFAULT 0 NOT NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT images_pkey PRIMARY KEY (id),
	CONSTRAINT images_article_id_fkey FOREIGN KEY (article_id) REFERENCES wechat_articles.articles(id) ON DELETE CASCADE
);
CREATE INDEX idx_images_article ON wechat_articles.images USING btree (article_id);
CREATE INDEX idx_images_type ON wechat_articles.images USING btree (image_type);


-- wechat_articles.scrape_progress definition

-- Drop table

-- DROP TABLE wechat_articles.scrape_progress;

CREATE TABLE wechat_articles.scrape_progress (
	id serial4 NOT NULL,
	source_id int4 NOT NULL,
	last_completed_page int4 DEFAULT 0 NOT NULL,
	next_page int4 DEFAULT 1 NOT NULL,
	total_articles int4 DEFAULT 0 NOT NULL,
	stop_reason varchar(64) DEFAULT ''::character varying NOT NULL,
	page_details jsonb NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT scrape_progress_pkey PRIMARY KEY (id),
	CONSTRAINT uq_progress_source UNIQUE (source_id),
	CONSTRAINT scrape_progress_source_id_fkey FOREIGN KEY (source_id) REFERENCES wechat_articles.sources(id) ON DELETE CASCADE
);


-- wechat_articles.scrape_queue definition

-- Drop table

-- DROP TABLE wechat_articles.scrape_queue;

CREATE TABLE wechat_articles.scrape_queue (
	id serial4 NOT NULL,
	source_id int4 NOT NULL,
	original_url text NOT NULL,
	title varchar(512) DEFAULT ''::character varying NOT NULL,
	author varchar(255) DEFAULT ''::character varying NOT NULL,
	publish_time varchar(32) DEFAULT ''::character varying NOT NULL,
	cover_url text DEFAULT ''::text NOT NULL,
	raw_meta jsonb NULL,
	status varchar(16) DEFAULT 'pending'::character varying NOT NULL,
	retry_count int4 DEFAULT 0 NOT NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT scrape_queue_pkey PRIMARY KEY (id),
	CONSTRAINT uq_queue_url UNIQUE (source_id, original_url),
	CONSTRAINT scrape_queue_source_id_fkey FOREIGN KEY (source_id) REFERENCES wechat_articles.sources(id) ON DELETE CASCADE
);
CREATE INDEX idx_queue_source ON wechat_articles.scrape_queue USING btree (source_id);
CREATE INDEX idx_queue_status ON wechat_articles.scrape_queue USING btree (status);